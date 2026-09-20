// @effect-diagnostics nodeBuiltinImport:off - these tests build real symlink and worktree layouts.
import { assert, it as effectIt } from "@effect/vitest";
import { ProjectId } from "@t3tools/contracts";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { describe, expect, it } from "vite-plus/test";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "../persistence/Migrations.ts";
import { discoverRepositoryCandidates } from "./WorkTrackingDiscovery.ts";
import { WorkTrackingService, layer } from "./WorkTrackingService.ts";

const createRepository = async (directory: string, worktree = false) => {
  await NodeFSP.mkdir(directory, { recursive: true });
  if (worktree)
    await NodeFSP.writeFile(NodePath.join(directory, ".git"), "gitdir: ../.git/worktrees/x\n");
  else await NodeFSP.mkdir(NodePath.join(directory, ".git"));
};

describe("work repository discovery", () => {
  it("finds nested repositories, worktrees, and the bound root without leaving it", async () => {
    const temporary = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-work-discovery-"));
    try {
      await createRepository(temporary);
      await Promise.all([
        createRepository(NodePath.join(temporary, "api")),
        createRepository(NodePath.join(temporary, "website")),
        createRepository(NodePath.join(temporary, "mobile")),
        createRepository(NodePath.join(temporary, "worktree"), true),
        createRepository(NodePath.join(temporary, "node_modules", "hidden")),
        createRepository(NodePath.join(temporary, "vendor", "hidden")),
      ]);
      const tooDeep = NodePath.join(
        temporary,
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
      );
      await createRepository(tooDeep);
      const outside = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-work-escape-"));
      try {
        await createRepository(outside);
        await NodeFSP.symlink(outside, NodePath.join(temporary, "escape"));
        const discovered = await discoverRepositoryCandidates([
          { localRoot: temporary, sourceProjectId: "project-a" },
          { localRoot: NodePath.join(temporary, "api"), sourceProjectId: "project-b" },
        ]);
        const roots = discovered.candidates.map((candidate) => candidate.localRoot);
        const resolvedTemporary = await NodeFSP.realpath(temporary);
        expect(roots).toEqual([
          resolvedTemporary,
          NodePath.join(resolvedTemporary, "api"),
          NodePath.join(resolvedTemporary, "mobile"),
          NodePath.join(resolvedTemporary, "website"),
          NodePath.join(resolvedTemporary, "worktree"),
        ]);
        expect(new Set(roots).size).toBe(roots.length);
        expect(roots.some((root) => root.includes("node_modules") || root.includes("vendor"))).toBe(
          false,
        );
        expect(roots.includes(tooDeep)).toBe(false);
        expect(roots.includes(outside)).toBe(false);
      } finally {
        await NodeFSP.rm(outside, { recursive: true, force: true });
      }
    } finally {
      await NodeFSP.rm(temporary, { recursive: true, force: true });
    }
  });

  it("bounds scans deterministically", async () => {
    const temporary = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-work-bounds-"));
    try {
      await Promise.all(
        Array.from({ length: 101 }, (_, index) =>
          createRepository(NodePath.join(temporary, `repo-${String(index).padStart(3, "0")}`)),
        ),
      );
      const first = await discoverRepositoryCandidates([
        { localRoot: temporary, sourceProjectId: "project" },
      ]);
      const second = await discoverRepositoryCandidates([
        { localRoot: temporary, sourceProjectId: "project" },
      ]);
      expect(first.truncated).toBe(true);
      expect(first.candidates.length).toBe(100);
      expect(second).toEqual(first);
    } finally {
      await NodeFSP.rm(temporary, { recursive: true, force: true });
    }
  });
});

let nonce = 0;
const crypto = Crypto.make({
  randomBytes: (size) => {
    const bytes = new Uint8Array(size);
    bytes[0] = nonce & 0xff;
    bytes[1] = (nonce >>> 8) & 0xff;
    nonce += 1;
    return bytes;
  },
  digest: (_algorithm, bytes) => Effect.succeed(bytes),
});
const dependencies = Layer.mergeAll(
  NodeSqliteClient.layer({ filename: ":memory:" }),
  Layer.succeed(Crypto.Crypto, crypto),
);
const testLayer = Layer.mergeAll(dependencies, layer.pipe(Layer.provide(dependencies)));

effectIt.effect("reviews discovered repositories and rejects roots outside bound workspaces", () =>
  Effect.gen(function* () {
    const workspace = yield* Effect.promise(() =>
      NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-work-bound-")),
    );
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => NodeFSP.rm(workspace, { recursive: true, force: true })),
    );
    yield* Effect.promise(() => createRepository(NodePath.join(workspace, "api")));
    yield* runMigrations({ toMigrationInclusive: 54 });
    const sql = yield* SqlClient.SqlClient;
    const work = yield* WorkTrackingService;
    yield* sql`INSERT INTO projection_projects(project_id, title, workspace_root, scripts_json, created_at, updated_at) VALUES ('t3-project', 'Project', ${workspace}, '[]', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`;
    const project = yield* work.upsertProject({
      name: "Ledger",
      t3ProjectIds: [ProjectId.make("t3-project")],
      trackingEnabled: true,
    });
    const saved = yield* work.upsertRepository({
      trackingProjectId: project.id,
      localRoot: NodePath.join(workspace, "api"),
      inclusion: "included",
      provenance: "discovered",
    });
    const excluded = yield* work.upsertRepository({
      trackingProjectId: project.id,
      localRoot: NodePath.join(workspace, "api"),
      inclusion: "excluded",
      provenance: "discovered",
    });
    assert.equal(excluded.id, saved.id);
    assert.equal(excluded.createdAt, saved.createdAt);
    const candidates = yield* work.discoverRepositories({ trackingProjectId: project.id });
    assert.equal(candidates.candidates[0]?.localRoot, saved.localRoot);
    assert.equal(candidates.candidates[0]?.inclusion, "excluded");
    assert.equal(candidates.candidates[0]?.provenance, "discovered");
    yield* sql`INSERT INTO projection_projects(project_id, title, workspace_root, scripts_json, created_at, updated_at) VALUES ('t3-other', 'Other', ${workspace}, '[]', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`;
    const other = yield* work.upsertProject({
      name: "Other",
      t3ProjectIds: [ProjectId.make("t3-other")],
      trackingEnabled: true,
    });
    const crossProject = yield* Effect.flip(
      work.upsertRepository({
        id: saved.id,
        trackingProjectId: other.id,
        localRoot: NodePath.join(workspace, "api"),
        inclusion: "included",
        provenance: "manual",
      }),
    );
    assert.equal(crossProject.message, "Repository belongs to another tracking project.");
    const outside = yield* Effect.promise(() =>
      NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-work-outside-")),
    );
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => NodeFSP.rm(outside, { recursive: true, force: true })),
    );
    yield* Effect.promise(() => createRepository(outside));
    yield* Effect.promise(() => NodeFSP.symlink(outside, NodePath.join(workspace, "escape")));
    const escaped = yield* Effect.flip(
      work.upsertRepository({
        trackingProjectId: project.id,
        localRoot: NodePath.join(workspace, "escape"),
        inclusion: "included",
        provenance: "manual",
      }),
    );
    assert.equal(escaped.message, "Repository must be inside a bound workspace root.");
    yield* Effect.promise(() => NodeFSP.mkdir(NodePath.join(workspace, "plain")));
    const nonGit = yield* Effect.flip(
      work.upsertRepository({
        trackingProjectId: project.id,
        localRoot: NodePath.join(workspace, "plain"),
        inclusion: "included",
        provenance: "manual",
      }),
    );
    assert.equal(nonGit.message, "Repository root must contain Git metadata.");
    const rejected = yield* Effect.flip(
      work.upsertRepository({
        trackingProjectId: project.id,
        localRoot: NodePath.join(workspace, "..", "outside"),
        inclusion: "included",
        provenance: "manual",
      }),
    );
    assert.equal(rejected.message, "Repository root must exist inside a bound workspace.");
    assert.ok(saved.id);
  }).pipe(Effect.provide(testLayer)),
);

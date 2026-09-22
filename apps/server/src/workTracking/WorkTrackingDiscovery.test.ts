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
  if (worktree) {
    const metadata = NodePath.join(directory, "..", ".git", "worktrees", "x");
    await NodeFSP.mkdir(metadata, { recursive: true });
    await NodeFSP.writeFile(NodePath.join(metadata, "commondir"), "../..\n");
    await NodeFSP.writeFile(NodePath.join(directory, ".git"), "gitdir: ../.git/worktrees/x\n");
  } else await NodeFSP.mkdir(NodePath.join(directory, ".git"));
};

describe("work repository discovery", () => {
  it("finds nested repositories without duplicating linked worktrees or leaving the bound root", async () => {
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
        ]);
        expect(new Set(roots).size).toBe(roots.length);
        expect(roots.some((root) => root.includes("node_modules") || root.includes("vendor"))).toBe(
          false,
        );
        expect(roots.includes(tooDeep)).toBe(false);
        expect(roots.includes(outside)).toBe(false);
        const worktreeOnly = await discoverRepositoryCandidates([
          { localRoot: NodePath.join(temporary, "worktree"), sourceProjectId: "worktree-project" },
        ]);
        expect(worktreeOnly.candidates).toMatchObject([
          {
            localRoot: NodePath.join(resolvedTemporary, "worktree"),
            canonicalIdentity: NodePath.join(resolvedTemporary, ".git"),
          },
        ]);
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

effectIt.effect("enabling Work provisions projects and nested repositories automatically", () =>
  Effect.gen(function* () {
    const workspace = yield* Effect.promise(() =>
      NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-work-provision-")),
    );
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => NodeFSP.rm(workspace, { recursive: true, force: true })),
    );
    yield* Effect.promise(() =>
      Promise.all([
        createRepository(NodePath.join(workspace, "api")),
        createRepository(NodePath.join(workspace, "website")),
        createRepository(NodePath.join(workspace, "mobile")),
      ]),
    );
    yield* runMigrations({ toMigrationInclusive: 54 });
    const sql = yield* SqlClient.SqlClient;
    const work = yield* WorkTrackingService;
    yield* sql`INSERT INTO projection_projects(project_id, title, workspace_root, scripts_json, created_at, updated_at) VALUES ('t3-project', 'Client workspace', ${workspace}, '[]', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`;

    yield* work.upsertProfile({
      displayName: "Developer",
      timeZone: "UTC",
      trackingEnabled: true,
    });
    yield* sql`DELETE FROM work_repositories`;
    yield* work.upsertProfile({
      displayName: "Developer",
      timeZone: "UTC",
      trackingEnabled: true,
    });

    const overview = yield* work.overview({
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(overview.projects.length, 1);
    assert.equal(overview.projects[0]?.name, "Client workspace");
    assert.deepEqual(overview.projects[0]?.t3ProjectIds, [ProjectId.make("t3-project")]);
    const canonicalWorkspace = yield* Effect.promise(() => NodeFSP.realpath(workspace));
    assert.deepEqual(
      overview.projects[0]?.repositories.map((repository) => ({
        root: repository.localRoot,
        inclusion: repository.inclusion,
        provenance: repository.provenance,
      })),
      ["api", "mobile", "website"].map((name) => ({
        root: NodePath.join(canonicalWorkspace, name),
        inclusion: "included",
        provenance: "discovered",
      })),
    );
  }).pipe(Effect.provide(testLayer)),
);

effectIt.effect("automatically provisions projects created after Work was enabled", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 54 });
    const sql = yield* SqlClient.SqlClient;
    const work = yield* WorkTrackingService;
    yield* work.upsertProfile({ displayName: "Developer", timeZone: "UTC", trackingEnabled: true });
    yield* sql`INSERT INTO projection_projects(project_id, title, workspace_root, scripts_json, created_at, updated_at) VALUES ('later-project', 'Later project', '/missing-workspace', '[]', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`;

    const beforeRecord = yield* work.overview({
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-09-02T00:00:00.000Z",
    });
    assert.equal(beforeRecord.projects[0]?.name, "Later project");

    yield* work.recordAutomatic({
      kind: "agent-turn",
      projectId: "later-project",
      threadId: "thread",
      turnId: "turn",
      sourceEventId: "event-later-project",
      occurredAt: "2026-09-01T12:00:00.000Z",
      provider: "codex",
      outcome: "succeeded",
      coverage: "complete",
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 5,
      reasoningTokens: 2,
      elapsedMs: 60,
      taskMs: null,
      model: null,
      effort: null,
      toolUses: 1,
    });

    const overview = yield* work.overview({
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-09-02T00:00:00.000Z",
    });
    assert.equal(overview.projects[0]?.name, "Later project");
    assert.equal(overview.records[0]?.sourceEventId, "event-later-project");
  }).pipe(Effect.provide(testLayer)),
);

effectIt.effect(
  "groups historical worktree aliases, preserves exclusions, and attributes new work once",
  () =>
    Effect.gen(function* () {
      const workspace = yield* Effect.promise(() =>
        NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-work-aliases-")),
      );
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => NodeFSP.rm(workspace, { recursive: true, force: true })),
      );
      yield* Effect.promise(async () => {
        await createRepository(workspace);
        await createRepository(NodePath.join(workspace, "worktree"), true);
      });
      yield* runMigrations({ toMigrationInclusive: 54 });
      const sql = yield* SqlClient.SqlClient;
      const work = yield* WorkTrackingService;
      const root = yield* Effect.promise(() => NodeFSP.realpath(workspace));
      const worktree = NodePath.join(root, "worktree");
      yield* sql`INSERT INTO projection_projects(project_id, title, workspace_root, scripts_json, created_at, updated_at) VALUES ('project', 'Project', ${root}, '[]', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`;
      yield* work.upsertProfile({
        displayName: "Developer",
        timeZone: "UTC",
        trackingEnabled: true,
      });
      const range = { since: "2026-09-01T00:00:00.000Z", until: "2026-10-01T00:00:00.000Z" };
      const initial = yield* work.overview(range);
      const project = initial.projects[0]!;
      const repository = project.repositories[0]!;
      yield* sql`INSERT INTO work_repositories(id, tracking_project_id, local_root, canonical_identity, inclusion, provenance, created_at, updated_at) VALUES ('old-worktree', ${project.id}, ${worktree}, NULL, 'excluded', 'discovered', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`;
      const excluded = yield* work.overview(range);
      assert.equal(excluded.projects[0]?.repositories.length, 1);
      assert.equal(excluded.projects[0]?.repositories[0]?.inclusion, "excluded");
      yield* work.upsertRepository({
        id: repository.id,
        trackingProjectId: project.id,
        localRoot: root,
        inclusion: "included",
        provenance: "discovered",
      });
      const automatic = {
        kind: "agent-turn" as const,
        projectId: "project",
        threadId: "thread",
        turnId: "turn",
        sourceEventId: "single",
        occurredAt: "2026-09-01T12:00:00.000Z",
        provider: "codex",
        outcome: "succeeded" as const,
        coverage: "complete" as const,
        inputTokens: 10,
        cachedInputTokens: 0,
        outputTokens: 5,
        reasoningTokens: 2,
        elapsedMs: 60,
        taskMs: null,
        model: null,
        effort: null,
        toolUses: 1,
      };
      yield* work.recordAutomatic(automatic);
      let overview = yield* work.overview(range);
      assert.equal(overview.records[0]?.repositoryId, repository.id);
      assert.equal(overview.records[0]?.crossRepository, false);
      yield* sql`UPDATE work_records SET repository_id = 'old-worktree' WHERE source_event_id = 'single'`;
      overview = yield* work.overview(range);
      assert.deepEqual(overview.repositoryInvolvement, [
        { trackingProjectId: project.id, repositoryId: repository.id, records: 1 },
      ]);
      assert.equal(overview.records[0]?.repositoryId, "old-worktree");
      yield* work.upsertRepository({
        id: repository.id,
        trackingProjectId: project.id,
        localRoot: root,
        inclusion: "excluded",
        provenance: "discovered",
      });
      yield* work.recordAutomatic({ ...automatic, sourceEventId: "excluded" });
      overview = yield* work.overview(range);
      assert.equal(
        overview.records.find((record) => record.sourceEventId === "excluded")?.repositoryId,
        null,
      );
      assert.equal(overview.records.length, 2);
      yield* Effect.promise(() => createRepository(NodePath.join(root, "api")));
      const discovered = yield* work.discoverRepositories({ trackingProjectId: project.id });
      assert.equal(
        discovered.candidates.find((candidate) => candidate.localRoot === root)?.inclusion,
        "excluded",
      );
      overview = yield* work.overview(range);
      assert.equal(overview.projects[0]?.repositories.length, 2);
      assert.equal(
        overview.projects[0]?.repositories.find((candidate) => candidate.localRoot.endsWith("/api"))
          ?.inclusion,
        "included",
      );
      yield* work.upsertRepository({
        id: repository.id,
        trackingProjectId: project.id,
        localRoot: root,
        inclusion: "included",
        provenance: "discovered",
      });
      const original = yield* work.upsertManualEntry({
        trackingProjectId: project.id,
        repositoryId: "old-worktree" as never,
        occurredAt: automatic.occurredAt,
        durationMs: 60_000,
      });
      const editable = (yield* work.manualRecords(range))[0]!;
      assert.equal(editable.repositoryId, repository.id);
      const correction = yield* work.upsertManualEntry({
        id: editable.id,
        trackingProjectId: editable.trackingProjectId,
        repositoryId: editable.repositoryId!,
        occurredAt: editable.occurredAt,
        durationMs: 120_000,
      });
      assert.equal(correction.repositoryId, repository.id);
      assert.equal(correction.revision, 1);
      const history = yield* sql<{
        readonly repositoryId: string;
        readonly supersedesId: string;
      }>`SELECT repository_id AS "repositoryId", supersedes_id AS "supersedesId" FROM work_records WHERE id = ${original.id}`;
      assert.equal(history[0]?.repositoryId, "old-worktree");
      assert.equal(history[0]?.supersedesId, correction.id);
    }).pipe(Effect.provide(testLayer)),
);

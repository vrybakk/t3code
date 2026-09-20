// @effect-diagnostics nodeBuiltinImport:off - lstat is required to refuse symlink traversal.
import {
  type WorkRepository,
  type WorkRepositoryCandidate,
  type WorkRepositoryDiscovery,
  type WorkRepositoryDiscoveryInput,
  WorkTrackingError,
} from "@t3tools/contracts";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

const MAX_DEPTH = 6;
const MAX_DIRECTORIES = 2_000;
const MAX_RESULTS = 100;
const ignoredDirectoryNames = new Set([
  ".cache",
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);
const failure = (message: string) => new WorkTrackingError({ message });
const mapSqlError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.catchCause(() => Effect.fail(failure("Could not read local workspaces."))));

export const isWithinWorkspaceRoot = (workspaceRoot: string, candidate: string) => {
  const root = NodePath.resolve(workspaceRoot);
  const resolved = NodePath.resolve(candidate);
  const relative = NodePath.relative(root, resolved);
  return (
    relative === "" ||
    (!relative.startsWith(`..${NodePath.sep}`) &&
      relative !== ".." &&
      !NodePath.isAbsolute(relative))
  );
};

interface ScanRoot {
  readonly localRoot: string;
  readonly sourceProjectId: string;
}

const isGitRepository = async (directory: string) => {
  try {
    const git = await NodeFSP.lstat(NodePath.join(directory, ".git"));
    return git.isDirectory() || git.isFile();
  } catch {
    return false;
  }
};

export const discoverRepositoryCandidates = async (
  roots: ReadonlyArray<ScanRoot>,
): Promise<{
  readonly candidates: ReadonlyArray<WorkRepositoryCandidate>;
  readonly truncated: boolean;
}> => {
  const candidates = new Map<string, WorkRepositoryCandidate>();
  let visited = 0;
  let truncated = false;
  const queue = (
    await Promise.all(
      roots.map(async (root) => {
        try {
          const localRoot = await NodeFSP.realpath(root.localRoot);
          return { ...root, workspaceRoot: localRoot, localRoot, depth: 0 };
        } catch {
          return null;
        }
      }),
    )
  )
    .filter((root): root is NonNullable<typeof root> => root !== null)
    .sort(
      (left, right) =>
        left.localRoot.localeCompare(right.localRoot) ||
        left.sourceProjectId.localeCompare(right.sourceProjectId),
    );
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (visited >= MAX_DIRECTORIES || candidates.size >= MAX_RESULTS) {
      truncated = true;
      break;
    }
    if (!isWithinWorkspaceRoot(current.workspaceRoot, current.localRoot)) continue;
    let metadata: Awaited<ReturnType<typeof NodeFSP.lstat>>;
    try {
      metadata = await NodeFSP.lstat(current.localRoot);
    } catch {
      continue;
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) continue;
    visited += 1;
    if (await isGitRepository(current.localRoot))
      candidates.set(
        current.localRoot,
        candidates.get(current.localRoot) ?? {
          localRoot: current.localRoot,
          canonicalIdentity: null,
          inclusion: null,
          provenance: null,
          sourceProjectId: current.sourceProjectId as never,
        },
      );
    if (current.depth >= MAX_DEPTH) continue;
    try {
      const entries = await NodeFSP.readdir(current.localRoot, {
        withFileTypes: true,
        encoding: "utf8",
      });
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || ignoredDirectoryNames.has(entry.name))
          continue;
        const child = NodePath.resolve(current.localRoot, entry.name);
        if (!isWithinWorkspaceRoot(current.workspaceRoot, child)) continue;
        queue.push({ ...current, localRoot: child, depth: current.depth + 1 });
      }
    } catch {
      continue;
    }
  }
  return {
    candidates: [...candidates.values()].sort(
      (left, right) =>
        left.localRoot.localeCompare(right.localRoot) ||
        left.sourceProjectId.localeCompare(right.sourceProjectId),
    ),
    truncated,
  };
};

export const makeWorkTrackingDiscovery = (sql: SqlClient.SqlClient) => {
  const discoverRepositories = Effect.fn("WorkTrackingService.discoverRepositories")(function* (
    input: WorkRepositoryDiscoveryInput,
  ) {
    const roots = yield* mapSqlError(
      sql<{
        readonly sourceProjectId: string;
        readonly localRoot: string;
      }>`SELECT bindings.project_id AS "sourceProjectId", projects.workspace_root AS "localRoot" FROM work_tracking_project_bindings AS bindings JOIN projection_projects AS projects ON projects.project_id = bindings.project_id WHERE bindings.tracking_project_id = ${input.trackingProjectId} AND projects.deleted_at IS NULL ORDER BY projects.workspace_root, bindings.project_id`,
    );
    const discovered = yield* Effect.tryPromise({
      try: () => discoverRepositoryCandidates(roots),
      catch: () => failure("Could not scan local workspaces."),
    });
    const existing = yield* mapSqlError(
      sql<WorkRepository>`SELECT id, tracking_project_id AS "trackingProjectId", local_root AS "localRoot", canonical_identity AS "canonicalIdentity", inclusion, provenance, created_at AS "createdAt", updated_at AS "updatedAt" FROM work_repositories WHERE tracking_project_id = ${input.trackingProjectId}`,
    );
    const existingByRoot = new Map(
      existing.map((repository) => [NodePath.resolve(repository.localRoot), repository]),
    );
    return {
      candidates: discovered.candidates.map((candidate) => {
        const repository = existingByRoot.get(candidate.localRoot);
        return {
          ...candidate,
          canonicalIdentity: repository?.canonicalIdentity ?? null,
          inclusion: repository?.inclusion ?? null,
          provenance: repository?.provenance ?? null,
        };
      }),
      truncated: discovered.truncated,
    } as WorkRepositoryDiscovery;
  });
  return { discoverRepositories };
};

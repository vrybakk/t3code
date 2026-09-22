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
import * as DateTime from "effect/DateTime";
import * as Crypto from "effect/Crypto";
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

export const readRepositoryIdentity = async (directory: string) => {
  try {
    const metadataPath = NodePath.join(directory, ".git");
    const git = await NodeFSP.lstat(metadataPath);
    if (git.isSymbolicLink()) return null;
    let gitDirectory = metadataPath;
    if (git.isFile()) {
      const content = await NodeFSP.readFile(metadataPath, "utf8");
      const target = /^gitdir:\s*(.+)\s*$/m.exec(content)?.[1]?.trim();
      if (!target) return null;
      gitDirectory = NodePath.resolve(directory, target);
    } else if (!git.isDirectory()) return null;
    let commonDirectory = gitDirectory;
    try {
      commonDirectory = NodePath.resolve(
        gitDirectory,
        (await NodeFSP.readFile(NodePath.join(gitDirectory, "commondir"), "utf8")).trim(),
      );
    } catch {
      // Ordinary repositories and submodules have no commondir file.
    }
    return {
      canonicalIdentity: await NodeFSP.realpath(commonDirectory),
      linkedWorktree: commonDirectory !== gitDirectory,
    };
  } catch {
    return null;
  }
};

export const groupWorkRepositories = async (repositories: ReadonlyArray<WorkRepository>) => {
  const resolved = await Promise.all(
    repositories.map(async (repository) => ({
      ...repository,
      canonicalIdentity:
        repository.canonicalIdentity ??
        (await readRepositoryIdentity(repository.localRoot))?.canonicalIdentity ??
        null,
    })),
  );
  const groups = new Map<
    string,
    { repository: WorkRepository; ids: Array<WorkRepository["id"]> }
  >();
  for (const repository of resolved.sort(
    (left, right) =>
      Number(right.canonicalIdentity === NodePath.join(right.localRoot, ".git")) -
        Number(left.canonicalIdentity === NodePath.join(left.localRoot, ".git")) ||
      left.localRoot.length - right.localRoot.length ||
      left.localRoot.localeCompare(right.localRoot),
  )) {
    const key = `${repository.trackingProjectId}:${repository.canonicalIdentity ?? repository.localRoot}`;
    const group = groups.get(key);
    if (!group) groups.set(key, { repository, ids: [repository.id] });
    else {
      group.ids.push(repository.id);
      if (repository.inclusion === "excluded")
        group.repository = { ...group.repository, inclusion: "excluded" };
    }
  }
  return [...groups.values()];
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
    const identity = await readRepositoryIdentity(current.localRoot);
    if (identity) {
      const existing = candidates.get(identity.canonicalIdentity);
      if (!existing || identity.canonicalIdentity === NodePath.join(current.localRoot, ".git"))
        candidates.set(identity.canonicalIdentity, {
          localRoot: current.localRoot,
          canonicalIdentity: identity.canonicalIdentity,
          inclusion: null,
          provenance: null,
          sourceProjectId: current.sourceProjectId as never,
        });
    }
    if (identity?.linkedWorktree && current.depth > 0) continue;
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

export const makeWorkTrackingDiscovery = (sql: SqlClient.SqlClient, crypto: Crypto.Crypto) => {
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
    const groups = yield* Effect.promise(() => groupWorkRepositories(existing));
    const now = DateTime.formatIso(yield* DateTime.now);
    for (const candidate of discovered.candidates) {
      if (
        groups.some(
          ({ repository }) =>
            repository.canonicalIdentity === candidate.canonicalIdentity ||
            repository.localRoot === candidate.localRoot,
        )
      )
        continue;
      const id = yield* crypto.randomUUIDv4;
      yield* mapSqlError(
        sql`INSERT INTO work_repositories(id, tracking_project_id, local_root, canonical_identity, inclusion, provenance, created_at, updated_at) VALUES (${id}, ${input.trackingProjectId}, ${candidate.localRoot}, ${candidate.canonicalIdentity}, 'included', 'discovered', ${now}, ${now}) ON CONFLICT(tracking_project_id, local_root) DO NOTHING`,
      );
    }
    return {
      candidates: discovered.candidates.map((candidate) => {
        const repository = groups.find(
          ({ repository }) =>
            repository.canonicalIdentity === candidate.canonicalIdentity ||
            NodePath.resolve(repository.localRoot) === candidate.localRoot,
        )?.repository;
        return {
          ...candidate,
          canonicalIdentity: repository?.canonicalIdentity ?? candidate.canonicalIdentity,
          inclusion: repository?.inclusion ?? "included",
          provenance: repository?.provenance ?? "discovered",
        };
      }),
      truncated: discovered.truncated,
    } as WorkRepositoryDiscovery;
  });
  return { discoverRepositories };
};

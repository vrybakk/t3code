import { ClickUpError, type ClickUpLocalRepository, type ProjectId } from "@t3tools/contracts";
import { normalizeGitRemoteUrl } from "@t3tools/shared/git";
import * as Effect from "effect/Effect";
import type { RepositoryIdentityResolver } from "../project/RepositoryIdentityResolver.ts";
import { discoverRepositoryCandidates } from "../workTracking/WorkTrackingDiscovery.ts";

export const findClickUpLocalRepositories = Effect.fn("findClickUpLocalRepositories")(function* (
  projects: ReadonlyArray<{ id: ProjectId; workspaceRoot: string }>,
  remoteUrls: ReadonlyArray<string>,
  resolver: RepositoryIdentityResolver["Service"],
) {
  const { candidates } = yield* Effect.tryPromise({
    try: () =>
      discoverRepositoryCandidates(
        projects.map((project) => ({
          localRoot: project.workspaceRoot,
          sourceProjectId: project.id,
        })),
      ),
    catch: () => new ClickUpError({ message: "Could not check local repository folders." }),
  });
  const remotes = new Set(remoteUrls.map(normalizeGitRemoteUrl));
  return yield* Effect.forEach(
    candidates,
    (candidate) =>
      resolver.resolve(candidate.localRoot, { refresh: true }).pipe(
        Effect.map((identity): ClickUpLocalRepository[] =>
          identity && remotes.has(normalizeGitRemoteUrl(identity.locator.remoteUrl))
            ? [
                {
                  projectId: candidate.sourceProjectId,
                  remoteUrl: identity.locator.remoteUrl,
                  cwd: candidate.localRoot,
                },
              ]
            : [],
        ),
      ),
    { concurrency: 4 },
  ).pipe(Effect.map((matches) => matches.flat()));
});

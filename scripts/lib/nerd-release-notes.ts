// @effect-diagnostics nodeBuiltinImport:off - Vite build configuration runs before an Effect runtime exists.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import type { NerdReleaseNotes, NerdReleaseSection } from "@t3tools/shared/nerdReleaseNotes";

interface Commit {
  readonly sha: string;
  readonly subject: string;
}

export function summarizeReleaseCommits(
  commits: ReadonlyArray<Commit>,
  reviewed: Readonly<Record<string, string>>,
): ReadonlyArray<string> {
  const items = commits.flatMap(({ sha, subject }) => {
    if (reviewed[sha]) return [reviewed[sha]];
    const match = /^(?:feat|fix|perf)(?:\([^)]*\))?!?:\s*(.+)$/i.exec(subject);
    const title = match?.[1];
    return title ? [title.charAt(0).toUpperCase() + title.slice(1)] : [];
  });
  return [...new Set(items)].slice(0, 5);
}

export function createNerdReleaseNotes({
  repoRoot,
  version,
  env = process.env,
}: {
  readonly repoRoot: string;
  readonly version: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}): NerdReleaseNotes {
  const git = (...args: string[]) =>
    NodeChildProcess.execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const resolve = (ref: string) => git("rev-parse", "--verify", `${ref}^{commit}`);
  const commit = resolve("HEAD");
  const fork = env.T3CODE_NERD_FORK_SHA ? resolve(env.T3CODE_NERD_FORK_SHA) : commit;
  const upstreamRef = env.T3CODE_NERD_UPSTREAM_SHA;
  let upstream: string | null = null;
  if (upstreamRef && upstreamRef !== "not-applicable") {
    upstream = resolve(upstreamRef);
  } else {
    // Local builds may not have an upstream remote. Never guess from the latest release online.
    try {
      upstream = git("merge-base", commit, "refs/remotes/upstream/main");
    } catch {
      upstream = null;
    }
  }
  const previous = env.T3CODE_NERD_PREVIOUS_RELEASE
    ? resolve(env.T3CODE_NERD_PREVIOUS_RELEASE)
    : null;
  for (const source of [fork, upstream]) {
    if (source) git("merge-base", "--is-ancestor", source, commit);
  }
  if (previous) {
    // Each nightly has a synthetic merge commit that is not on the next nightly's ancestry.
    // Its source parents, however, must both be incorporated before calling this an update.
    const parents = git("rev-list", "--parents", "-n", "1", previous).split(" ").slice(1);
    for (const source of parents.length > 1 ? parents : [previous]) {
      git("merge-base", "--is-ancestor", source, commit);
    }
  }
  const base = previous ?? (upstream ? git("merge-base", fork, upstream) : null);
  const reviewed: unknown = JSON.parse(
    NodeFS.readFileSync(NodePath.join(repoRoot, "apps/desktop/release-highlights.json"), "utf8"),
  );
  if (
    typeof reviewed !== "object" ||
    reviewed === null ||
    Array.isArray(reviewed) ||
    Object.entries(reviewed).some(
      ([sha, title]) => !/^[a-f0-9]{40}$/.test(sha) || typeof title !== "string" || !title.trim(),
    )
  )
    throw new Error("Release highlights must map full commit hashes to non-empty summaries.");
  const highlights = reviewed as Record<string, string>;
  const sourceUrl = (repository: string, head: string, from: string | null) =>
    `https://github.com/${repository}/${from ? `compare/${from}...${head}` : `commits/${head}`}`;
  const section = (
    repository: string,
    head: string,
    exclusions: string[],
    from: string | null,
  ): NerdReleaseSection => {
    const log = git(
      "log",
      "--no-merges",
      "--format=%H%x09%s",
      head,
      ...(exclusions.length ? ["--not", ...exclusions] : []),
      "--",
    );
    const commits = log
      ? log.split("\n").map((line) => ({ sha: line.slice(0, 40), subject: line.slice(41) }))
      : [];
    return {
      items: summarizeReleaseCommits(commits, highlights),
      changeCount: commits.length,
      sourceUrl: sourceUrl(repository, head, from),
    };
  };
  return {
    buildId: `${version}:${commit}`,
    version,
    commit,
    comparedToPreviousRelease: previous !== null,
    changelogUrl: sourceUrl("vrybakk/t3code", commit, previous),
    nerd: section(
      "vrybakk/t3code",
      fork,
      [base, upstream].filter((sha): sha is string => sha !== null),
      base,
    ),
    upstream: upstream
      ? section(
          "pingdotgg/t3code",
          upstream,
          base ? [base] : [],
          base ? git("merge-base", base, upstream) : null,
        )
      : null,
  };
}

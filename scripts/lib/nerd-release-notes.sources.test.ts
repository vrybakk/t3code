// @effect-diagnostics nodeBuiltinImport:off - Build-source tests replace git and filesystem reads.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createNerdReleaseNotes } from "./nerd-release-notes.ts";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("node:fs", () => ({ readFileSync: vi.fn(() => "{}") }));

const sha = (digit: string) => digit.repeat(40);
const base = sha("0"),
  oldFork = sha("1"),
  oldUpstream = sha("2"),
  previous = sha("3");
const fork = sha("4"),
  upstream = sha("5"),
  current = sha("6"),
  future = sha("7");
const graph: Record<string, { parents: string[]; subject: string }> = {
  [base]: { parents: [], subject: "feat: baseline" },
  [oldFork]: { parents: [base], subject: "feat: old Nerd feature" },
  [oldUpstream]: { parents: [base], subject: "feat: old upstream feature" },
  [previous]: { parents: [oldFork, oldUpstream], subject: "Merge old release" },
  [fork]: { parents: [oldFork], subject: "fix: new Nerd fix" },
  [upstream]: { parents: [oldUpstream], subject: "feat: new upstream feature" },
  [current]: { parents: [fork, upstream], subject: "Merge new release" },
  [future]: { parents: [upstream], subject: "feat: not shipped" },
};

function ancestors(head: string): Set<string> {
  return new Set([head, ...graph[head]!.parents.flatMap((parent) => [...ancestors(parent)])]);
}

function useGitGraph() {
  vi.mocked(NodeChildProcess.execFileSync).mockImplementation((_file, args) => {
    const command = args as string[];
    if (command[0] === "rev-parse") {
      const ref = command[2]!.replace(/\^\{commit\}$/, "");
      return ref === "HEAD" ? current : ref;
    }
    if (command[0] === "rev-list") return [previous, oldFork, oldUpstream].join(" ");
    if (command[0] === "merge-base") {
      if (command[1] === "--is-ancestor") {
        if (!ancestors(command[3]!).has(command[2]!)) throw new Error("Source not included");
        return "";
      }
      const right = command[2] === "refs/remotes/upstream/main" ? future : command[2]!;
      return [...ancestors(right)].find((candidate) => ancestors(command[1]!).has(candidate))!;
    }
    if (command[0] === "log") {
      const head = command[3]!;
      const excluded = command.includes("--not")
        ? new Set(
            command.slice(command.indexOf("--not") + 1, -1).flatMap((ref) => [...ancestors(ref)]),
          )
        : new Set<string>();
      return [...ancestors(head)]
        .filter((ref) => !excluded.has(ref) && graph[ref]!.parents.length < 2)
        .map((ref) => `${ref}\t${graph[ref]!.subject}`)
        .join("\n");
    }
    throw new Error(`Unexpected git read: ${command.join(" ")}`);
  });
}

afterEach(() => vi.clearAllMocks());

describe("bundled Nerd release sources", () => {
  it("compares consecutive synthetic nightlies without repeating old changes or including future upstream", () => {
    useGitGraph();
    const notes = createNerdReleaseNotes({
      repoRoot: "/fixture",
      version: "1.0.0",
      env: {
        T3CODE_NERD_FORK_SHA: fork,
        T3CODE_NERD_UPSTREAM_SHA: upstream,
        T3CODE_NERD_PREVIOUS_RELEASE: previous,
      },
    });
    expect(notes.nerd.items).toEqual(["New Nerd fix"]);
    expect(notes.upstream?.items).toEqual(["New upstream feature"]);
    expect(notes.buildId).toBe(`1.0.0:${current}`);
    expect(notes.changelogUrl).toBe(`https://github.com/vrybakk/t3code/compare/${previous}...${fork}`);
    expect(notes.upstream?.sourceUrl).toBe(
      `https://github.com/pingdotgg/t3code/compare/${oldUpstream}...${upstream}`,
    );
    expect(notes.comparedToPreviousRelease).toBe(true);
  });

  it("links unsigned nightly notes to the published fork instead of the unpublished build merge", () => {
    useGitGraph();
    const notes = createNerdReleaseNotes({
      repoRoot: "/fixture",
      version: "1.0.0",
      env: { T3CODE_NERD_FORK_SHA: fork, T3CODE_NERD_UPSTREAM_SHA: upstream },
    });
    expect(notes.changelogUrl).toBe(`https://github.com/vrybakk/t3code/commits/${fork}`);
    expect(notes.commit).toBe(current);
  });

  it("separates upstream commits already merged into a stable fork", () => {
    useGitGraph();
    const notes = createNerdReleaseNotes({
      repoRoot: "/fixture",
      version: "1.0.0",
      env: {
        T3CODE_NERD_UPSTREAM_SHA: "not-applicable",
        T3CODE_NERD_PREVIOUS_RELEASE: previous,
      },
    });
    expect(notes.nerd.items).toEqual(["New Nerd fix"]);
    expect(notes.upstream?.items).toEqual(["New upstream feature"]);
  });

  it("refuses to describe upstream commits not present in the built app", () => {
    useGitGraph();
    expect(() =>
      createNerdReleaseNotes({
        repoRoot: "/fixture",
        version: "1.0.0",
        env: {
          T3CODE_NERD_UPSTREAM_SHA: future,
        },
      }),
    ).toThrow("Source not included");
  });

  it("rejects malformed reviewed highlights instead of shipping them", () => {
    useGitGraph();
    vi.mocked(NodeFS.readFileSync).mockReturnValueOnce('{"not-a-commit":"made up"}');
    expect(() =>
      createNerdReleaseNotes({ repoRoot: "/fixture", version: "1.0.0", env: {} }),
    ).toThrow("Release highlights must map full commit hashes");
  });
});

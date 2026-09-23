import { describe, expect, it } from "vite-plus/test";
import { summarizeReleaseCommits } from "./nerd-release-notes.ts";

describe("Nerd release highlights", () => {
  it("uses reviewed copy only for commits included in the release", () => {
    expect(
      summarizeReleaseCommits(
        [
          { sha: "included", subject: "fix(web): improve reports" },
          { sha: "fallback", subject: "feat: add project groups" },
        ],
        { included: "Reports are easier to read.", future: "A feature not shipped yet." },
      ),
    ).toEqual(["Reports are easier to read.", "Add project groups"]);
  });

  it("keeps a short deduplicated summary, excluding internal commit noise", () => {
    const subjects = [
      "docs: update guide",
      "chore: release",
      "Merge upstream",
      "fix(ui): fix spacing",
      "fix(ui): fix spacing",
      "feat!: introduce work",
      "perf(server): speed up queries",
      "fix: restore filters",
      "feat: add timers",
      "feat: sixth highlight",
    ];
    expect(
      summarizeReleaseCommits(
        subjects.map((subject, i) => ({ sha: `${i}`, subject })),
        {},
      ),
    ).toEqual([
      "Fix spacing",
      "Introduce work",
      "Speed up queries",
      "Restore filters",
      "Add timers",
    ]);
  });

  it("does not fabricate highlights for a maintenance-only release", () => {
    expect(
      summarizeReleaseCommits([{ sha: "a", subject: "chore: refresh dependencies" }], {}),
    ).toEqual([]);
  });
});

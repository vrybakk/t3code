import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ProcessRunner from "../processRunner.ts";
import * as RepositoryIdentityResolver from "../project/RepositoryIdentityResolver.ts";
import { findClickUpLocalRepositories } from "./ClickUpLocalRepositories.ts";

it.layer(NodeServices.layer)("ClickUp local repositories", (it) => {
  it.effect(
    "recognizes matching child checkouts without treating a parent folder as a Git repository",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const process = yield* ProcessRunner.ProcessRunner;
        for (const [name, remote] of [
          ["culture-queer", "git@github.com:nerd-stud-io/image-nations.git"],
          ["api", "https://github.com/nerd-stud-io/image-nations"],
          ["unrelated", "https://github.com/company/other"],
        ]) {
          const cwd = path.join(root, name!);
          yield* fs.makeDirectory(cwd);
          yield* process.run({ command: "git", args: ["-C", cwd, "init"] });
          yield* process.run({
            command: "git",
            args: ["-C", cwd, "remote", "add", "origin", remote!],
          });
        }
        const resolver = yield* RepositoryIdentityResolver.make();
        const projects = [{ id: ProjectId.make("parent"), workspaceRoot: root }];
        expect(yield* resolver.resolve(root)).toBeNull();
        const found = yield* findClickUpLocalRepositories(
          projects,
          ["https://github.com/nerd-stud-io/image-nations"],
          resolver,
        );
        expect(found.map((repo) => ({ ...repo, cwd: path.basename(repo.cwd) }))).toEqual([
          {
            projectId: "parent",
            cwd: "api",
            remoteUrl: "https://github.com/nerd-stud-io/image-nations",
          },
          {
            projectId: "parent",
            cwd: "culture-queer",
            remoteUrl: "git@github.com:nerd-stud-io/image-nations.git",
          },
        ]);
        expect(
          yield* findClickUpLocalRepositories(
            projects,
            ["https://github.com/company/missing"],
            resolver,
          ),
        ).toEqual([]);
        expect(
          yield* findClickUpLocalRepositories(
            [{ ...projects[0]!, workspaceRoot: path.join(root, "absent") }],
            ["https://github.com/nerd-stud-io/image-nations"],
            resolver,
          ),
        ).toEqual([]);
        expect(yield* resolver.resolve(root)).toBeNull();
      }).pipe(Effect.provide(ProcessRunner.layer), Effect.scoped),
  );
});

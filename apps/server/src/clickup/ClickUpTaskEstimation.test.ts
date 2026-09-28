import { it, assert } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ClickUpError,
  type ClickUpTaskDetails,
  type TaskEstimationResponse,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import { vi, beforeEach } from "vite-plus/test";
import { WorkspaceEntries } from "../workspace/WorkspaceEntries.ts";
import { WorkspaceFileSystem } from "../workspace/WorkspaceFileSystem.ts";
import { VcsProcess } from "../vcs/VcsProcess.ts";
import { ProjectCloneTracker } from "../project/ProjectCloneTracker.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { RepositoryIdentityResolver } from "../project/RepositoryIdentityResolver.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { ProviderInstanceRegistry } from "../provider/Services/ProviderInstanceRegistry.ts";
import { TextGeneration } from "../textGeneration/TextGeneration.ts";
import { collectEstimationEvidence } from "./ClickUpEstimationResearch.ts";
import { estimationRepositories } from "./ClickUpTaskRepositories.ts";
import { ClickUpTaskEstimation, layer } from "./ClickUpTaskEstimation.ts";

vi.mock("./ClickUpEstimationResearch.ts", () => ({
  collectEstimationEvidence: vi.fn(),
}));
vi.mock("./ClickUpTaskRepositories.ts", () => ({ estimationRepositories: vi.fn() }));
const evidence = {
  context: "Actual code and tests",
  files: ["app/src/pay.ts"],
  limitations: [],
  hasImplementation: true,
  verify: Effect.succeed(undefined),
};
const details: ClickUpTaskDetails = {
  task: {
    workspaceId: "42",
    taskId: "task",
    name: "Hide Pay for cash orders",
    description: "Hide Pay when payment method is cash",
    status: "To do",
    listName: "Sprint",
    tags: [],
  },
  attachments: [],
  comments: [],
  commentsMayHaveMore: false,
};
const input = {
  details,
  cwd: "/temporary-analysis",
  modelSelection: DEFAULT_SERVER_SETTINGS.textGenerationModelSelection,
};
const response: TaskEstimationResponse = {
  summary: "Change the existing condition in src/pay.ts and run its tests.",
  searches: [],
  files: [],
  estimate: {
    implementationMinutes: 3,
    verificationMinutes: 2,
    followUpMinutes: 0,
    confidence: "high",
    blockers: [],
  },
};
beforeEach(() => {
  vi.mocked(collectEstimationEvidence).mockReset().mockReturnValue(Effect.succeed(evidence));
  vi.mocked(estimationRepositories)
    .mockReset()
    .mockReturnValue(Effect.succeed([{ cwd: "/repo", title: "App" }]));
});
const run = (result = response, onGenerate = () => {}) => {
  const dependencies = Layer.mergeAll(
    Layer.mock(TextGeneration)({
      researchTaskEstimate: () =>
        Effect.sync(() => {
          onGenerate();
          return result;
        }),
    }),
    Layer.mock(ProviderInstanceRegistry)({ getInstance: () => Effect.succeed(undefined) }),
    Layer.mock(WorkspaceEntries)({}),
    Layer.mock(WorkspaceFileSystem)({}),
    Layer.mock(VcsProcess)({}),
    Layer.mock(ProjectCloneTracker)({}),
    Layer.mock(ProjectionSnapshotQuery)({}),
    Layer.mock(RepositoryIdentityResolver)({}),
    Layer.mock(ServerSettingsService)({}),
    FileSystem.layerNoop({}),
    Path.layer,
  );
  return Effect.gen(function* () {
    return yield* (yield* ClickUpTaskEstimation).run(input);
  }).pipe(Effect.provide(layer.pipe(Layer.provide(dependencies))));
};
it.effect("sums concrete AI-assisted phases without a minimum or multiplier", () =>
  Effect.gen(function* () {
    const result = yield* run();
    assert.equal(result.estimateMinutes, 5);
    assert.deepEqual(result.estimationEvidence.files, ["app/src/pay.ts"]);
  }),
);
it.effect("does not provide a number for low confidence or unresolved blockers", () =>
  Effect.gen(function* () {
    for (const estimate of [
      null,
      { ...response.estimate!, confidence: "low" as const },
      { ...response.estimate!, blockers: ["API behavior is unknown"] },
    ]) {
      assert.equal((yield* run({ ...response, estimate })).estimateMinutes, null);
    }
  }),
);
it.effect("does not estimate from filenames when implementation was not found", () =>
  Effect.gen(function* () {
    vi.mocked(collectEstimationEvidence).mockReturnValue(
      Effect.succeed({ ...evidence, hasImplementation: false }),
    );
    const generate = vi.fn();
    const result = yield* run(response, generate);
    assert.equal(result.estimateMinutes, null);
    assert.equal(generate.mock.calls.length, 0);
  }),
);
it.effect("rejects a result when repository links change while the model runs", () =>
  Effect.gen(function* () {
    const result = yield* Effect.result(
      run(response, () =>
        vi
          .mocked(estimationRepositories)
          .mockReturnValue(Effect.succeed([{ cwd: "/different-repo", title: "Other app" }])),
      ),
    );
    assert.equal(result._tag, "Failure");
    if (result._tag === "Failure")
      assert.include(String(result.failure), "repository links changed");
  }),
);
it.effect("rejects changed source evidence before returning a number", () =>
  Effect.gen(function* () {
    vi.mocked(collectEstimationEvidence).mockReturnValue(
      Effect.succeed({
        ...evidence,
        verify: Effect.fail(new ClickUpError({ message: "Code changed" })),
      }),
    );
    assert.equal((yield* Effect.result(run()))._tag, "Failure");
  }),
);

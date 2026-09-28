import { ClickUpTaskEstimation } from "./ClickUpTaskEstimation.ts";
import { it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ClickUpError,
  type ClickUpTaskDetails,
  type TaskAnalysis,
  TextGenerationError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { expect, vi } from "vite-plus/test";
import { ServerSettingsService } from "../serverSettings.ts";
import { TextGeneration } from "../textGeneration/TextGeneration.ts";
import { ClickUpTasks } from "./ClickUpTasks.ts";
import { ClickUpTaskEditing } from "./ClickUpTaskEditing.ts";
import { ClickUpWorkflow } from "./ClickUpWorkflow.ts";
import { ClickUpTaskAnalysis, layer } from "./ClickUpTaskAnalysis.ts";

const input = { workspaceId: "42", taskId: "task", userId: 7 };
const details: ClickUpTaskDetails = {
  task: {
    ...input,
    name: "Fix checkout",
    description: "Handle empty carts",
    status: "To do",
    listName: "Sprint",
    tags: ["no agent"],
  },
  comments: [],
  attachments: [],
  commentsMayHaveMore: false,
};
const configuredModel = {
  ...DEFAULT_SERVER_SETTINGS.textGenerationModelSelection,
  model: "configured-text-model",
};
const harness = Effect.fn(function* (generated: TaskAnalysis, snapshot = details) {
  const detail = vi.fn(() => Effect.succeed(snapshot));
  const generateTaskAnalysis = vi.fn<TextGeneration["Service"]["generateTaskAnalysis"]>(() =>
    Effect.succeed(generated),
  );
  const completeEstimation = vi.fn(() => Effect.succeed({ estimateMinutes: 30, tagRemoved: true }));
  const findings = vi.fn(() => Effect.void);
  const service = yield* ClickUpTaskAnalysis.pipe(
    Effect.provide(
      layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.mock(ClickUpTasks)({ detail }),
            Layer.mock(ClickUpTaskEditing)({ completeEstimation }),
            Layer.mock(ClickUpWorkflow)({ findings }),
            Layer.mock(TextGeneration)({ generateTaskAnalysis }),
            Layer.mock(ClickUpTaskEstimation)({
              run: (args) =>
                generateTaskAnalysis({
                  ...args,
                  prompt: 'Return only a JSON object with all three keys: "summary"',
                }).pipe(
                  Effect.mapError((error) => new ClickUpError({ message: error.detail })),
                  Effect.map((result) => ({
                    ...result,
                    estimationEvidence: {
                      implementationMinutes: 20,
                      verificationMinutes: 10,
                      followUpMinutes: 0,
                      confidence: "high" as const,
                      files: ["app/checkout.ts"],
                      limitations: [],
                    },
                  })),
                ),
            }),
            Layer.mock(ServerSettingsService)({
              getSettings: Effect.succeed({
                ...DEFAULT_SERVER_SETTINGS,
                textGenerationModelSelection: configuredModel,
              }),
            }),
            FileSystem.layerNoop({
              makeTempDirectoryScoped: () => Effect.succeed("/temporary-analysis"),
            }),
          ),
        ),
      ),
    ),
  );
  return { service, detail, generateTaskAnalysis, completeEstimation, findings };
});

it.effect(
  "uses the environment text model, saves a missing estimate and permits no agent analysis",
  () =>
    Effect.gen(function* () {
      const h = yield* harness({
        summary: "Task-context estimate",
        estimateMinutes: 30,
        findings: null,
      });
      const result = yield* h.service.run({ ...input, action: "estimate" });
      expect(h.generateTaskAnalysis.mock.calls[0]?.[0]).toMatchObject({
        modelSelection: configuredModel,
        cwd: "/temporary-analysis",
      });
      expect(h.generateTaskAnalysis.mock.calls[0]?.[0]?.prompt).toContain(
        'Return only a JSON object with all three keys: "summary"',
      );
      expect(h.completeEstimation).toHaveBeenCalledWith({
        ...input,
        action: "estimate",
        estimateMinutes: 30,
      });
      expect(result.estimateSaved).toBe(true);
      expect(h.findings).not.toHaveBeenCalled();
    }),
);
it.effect("preserves an existing estimate without invoking a model", () =>
  Effect.gen(function* () {
    const h = yield* harness(
      { summary: "Unused", estimateMinutes: 30, findings: null },
      { ...details, task: { ...details.task, timeEstimate: 60000 } },
    );
    const result = yield* h.service.run({ ...input, action: "estimate" });
    expect(result.estimateSaved).toBe(false);
    expect(h.generateTaskAnalysis).not.toHaveBeenCalled();
    expect(h.completeEstimation).not.toHaveBeenCalled();
  }),
);
it.effect("does not save an unclear estimate or post an estimate comment", () =>
  Effect.gen(function* () {
    const h = yield* harness({
      summary: "Missing acceptance criteria",
      estimateMinutes: null,
      findings: "I need the intended behavior.",
    });
    const result = yield* h.service.run({ ...input, action: "estimate" });
    expect(result.findings).toBeNull();
    expect(h.completeEstimation).not.toHaveBeenCalled();
    expect(h.findings).not.toHaveBeenCalled();
  }),
);
it.effect("posts only actionable requirements findings and never estimates", () =>
  Effect.gen(function* () {
    const h = yield* harness({
      summary: "A question remains",
      estimateMinutes: 30,
      findings: "I need the intended checkout behavior.",
    });
    const result = yield* h.service.run({ ...input, action: "requirements" });
    expect(h.findings).toHaveBeenCalledWith(
      { ...input, action: "requirements" },
      { text: "I need the intended checkout behavior.", actionable: true },
    );
    expect(result.findingsPosted).toBe(true);
    expect(result.estimateMinutes).toBeNull();
    expect(h.completeEstimation).not.toHaveBeenCalled();
  }),
);
it.effect("does not comment on a clean requirements check", () =>
  Effect.gen(function* () {
    const h = yield* harness({
      summary: "No gaps in supplied context",
      estimateMinutes: null,
      findings: null,
    });
    yield* h.service.run({ ...input, action: "requirements" });
    expect(h.findings).not.toHaveBeenCalled();
  }),
);
it.effect("rejects stale analysis before writing", () =>
  Effect.gen(function* () {
    const h = yield* harness({ summary: "Estimate", estimateMinutes: 30, findings: null });
    h.detail.mockReturnValueOnce(Effect.succeed(details));
    h.detail.mockReturnValueOnce(
      Effect.succeed({ ...details, task: { ...details.task, description: "Changed scope" } }),
    );
    const result = yield* h.service.run({ ...input, action: "estimate" }).pipe(Effect.result);
    expect(Result.isFailure(result)).toBe(true);
    expect(h.completeEstimation).not.toHaveBeenCalled();
    expect(h.findings).not.toHaveBeenCalled();
  }),
);

it.effect("surfaces provider failure without writing task data", () =>
  Effect.gen(function* () {
    const h = yield* harness({ summary: "Unused", estimateMinutes: null, findings: null });
    h.generateTaskAnalysis.mockReturnValue(
      Effect.fail(
        new TextGenerationError({
          operation: "generateTaskAnalysis",
          detail: "Configured model is unavailable",
        }),
      ),
    );
    const result = yield* h.service.run({ ...input, action: "requirements" }).pipe(Effect.result);
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result))
      expect(result.failure.message).toBe("Configured model is unavailable");
    expect(h.completeEstimation).not.toHaveBeenCalled();
    expect(h.findings).not.toHaveBeenCalled();
  }),
);

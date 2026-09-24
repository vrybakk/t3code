import { assert, it } from "@effect/vitest";
import {
  ClickUpError,
  PullRequestOperationError,
  ProjectId,
  ThreadId,
  type ClickUpPrepareHandoffInput,
  IsoDateTime,
  type PullRequestDetail,
} from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import migration from "../persistence/Migrations/057_ClickUpWorkflow.ts";
import { PullRequestService } from "../pullRequest/PullRequestService.ts";
import { ClickUpTasks } from "./ClickUpTasks.ts";
import { ClickUpTaskEditing } from "./ClickUpTaskEditing.ts";
import { ClickUpInteractions } from "./ClickUpInteractions.ts";
import * as Store from "./ClickUpWorkflowStore.ts";
import * as Workflow from "./ClickUpWorkflow.ts";

const task = { workspaceId: "42", taskId: "task", userId: 7 };
const threadId = ThreadId.make("thread");
const url = "https://github.com/studio/repo/pull/1";
const input: ClickUpPrepareHandoffInput = {
  summary: "I implemented the requested change and verified the result.",
  evidence: [
    {
      kind: "independent-review",
      outcome: "passed",
      details: "Separate reviewer inspected commit abc and found no unresolved issues.",
    },
    {
      kind: "verification",
      outcome: "passed",
      details: "Tests and browser acceptance flow passed on abc.",
    },
  ],
  reviewedHeads: [{ url, headSha: "abc" }],
};
const prFixture: PullRequestDetail = {
  provider: "github",
  projectId: ProjectId.make("project"),
  projectTitle: "Repo",
  workspaceRoot: "/repo",
  repository: "studio/repo",
  number: 1,
  title: "Change",
  body: "",
  url,
  author: { login: "developer", name: null, avatarUrl: null },
  state: "open",
  isDraft: true,
  headSha: "abc",
  headBranch: "feature",
  baseBranch: "main",
  mergeability: "unknown",
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  createdAt: IsoDateTime.make("2026-09-24T00:00:00.000Z"),
  updatedAt: IsoDateTime.make("2026-09-24T00:00:00.000Z"),
  mergedAt: null,
  closedAt: null,
  reviewers: [],
  labels: [],
  checks: [],
  mergeCapabilities: { merge: true, squash: true, rebase: true },
  capabilities: {
    diff: true,
    comment: true,
    actions: ["ready"],
    mergeMethods: ["merge"],
    search: true,
    review: { inlineComment: true, reply: true, resolve: true, verdicts: [] },
    reviewers: { request: true, listCandidates: true },
  },
  viewerPermissions: {
    actions: ["ready"],
    comment: true,
    resolve: true,
    verdicts: [],
    requestReviewers: true,
  },
};
const harness = Effect.fn("workflowHarness")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* migration;
  yield* sql`CREATE TABLE projection_threads(thread_id TEXT, project_id TEXT, deleted_at TEXT)`;
  yield* sql`CREATE TABLE projection_thread_clickup_tasks(thread_id TEXT, task_id TEXT, workspace_id TEXT)`;
  yield* sql`CREATE TABLE projection_thread_pull_requests(thread_id TEXT, host TEXT, repository TEXT, number INTEGER, url TEXT)`;
  yield* sql`INSERT INTO projection_threads VALUES ('thread', 'project', NULL)`;
  yield* sql`INSERT INTO projection_thread_clickup_tasks VALUES ('thread', 'task', '42')`;
  yield* sql`INSERT INTO projection_thread_pull_requests VALUES ('thread', 'github.com', 'studio/repo', 1, ${url})`;
  const state = {
    tags: [] as string[],
    head: "abc",
    draft: true,
    author: "developer",
    reviewers: [] as string[],
    status: "In Progress",
    failReviewer: false,
    failComment: false,
    writes: [] as string[],
    comments: [] as string[],
  };
  const dependencies = Layer.mergeAll(
    Layer.succeed(SqlClient.SqlClient, sql),
    Layer.mock(ClickUpTasks)({
      detail: (selected) =>
        selected.userId !== task.userId
          ? Effect.fail(new ClickUpError({ message: "Account changed" }))
          : Effect.sync(() => ({
              task: {
                ...task,
                name: "Task",
                status: state.status,
                listName: "Sprint",
                description: "",
                tags: state.tags,
              },
              comments: [],
              commentsMayHaveMore: false,
              attachments: [],
            })),
    }),
    Layer.mock(ClickUpTaskEditing)({
      options: () =>
        Effect.sync(() => ({
          statuses: ["Open", "In Progress", "Code Review"].map((name) => ({
            name,
            color: null,
            type: null,
          })),
          tags: [],
          currentTags: state.tags,
          status: state.status,
        })),
      setStatus: (selected) =>
        Effect.sync(() => {
          state.writes.push(`status:${selected.status}`);
          state.status = selected.status;
        }),
    }),
    Layer.mock(ClickUpInteractions)({
      createComment: (selected) =>
        Effect.gen(function* () {
          state.comments.push(selected.text);
          if (state.failComment) return yield* new ClickUpError({ message: "Lost response" });
        }),
    }),
    Layer.mock(PullRequestService)({
      invalidate: () => Effect.void,
      detail: () =>
        Effect.sync(() => ({
          ...prFixture,
          headSha: state.head,
          isDraft: state.draft,
          author: { login: state.author, name: null, avatarUrl: null },
          reviewers: state.reviewers.map((login) => ({ login, name: null, avatarUrl: null })),
          projectId: ProjectId.make("project"),
        })),
      runAction: (selected) =>
        Effect.sync(() => {
          state.writes.push(selected.action);
          state.draft = false;
        }),
      requestReviewers: () =>
        Effect.gen(function* () {
          state.writes.push("reviewer");
          if (state.failReviewer)
            return yield* new PullRequestOperationError({
              operation: "requestReviewers",
              detail: "Reviewer unavailable",
            });
          state.reviewers.push("vrybakk");
        }),
    }),
  );
  const service = yield* Workflow.ClickUpWorkflow.pipe(
    Effect.provide(Workflow.layer.pipe(Layer.provide(Store.layer), Layer.provide(dependencies))),
  );
  return { service, state, sql };
});
const database = NodeSqliteClient.layer({ filename: ":memory:" });

it.effect("starts implementation only after checking the current no agent tag", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    state.tags = ["No Agent"];
    assert.equal((yield* Effect.result(service.start(task)))._tag, "Failure");
    assert.deepEqual(state.writes, []);
    state.tags = [];
    for (const status of ["QA Testing", "READY"]) {
      state.status = status;
      assert.equal((yield* Effect.result(service.start(task)))._tag, "Failure");
      assert.deepEqual(state.writes, []);
    }
    state.status = "Open";
    yield* service.start(task);
    yield* service.start(task);
    assert.deepEqual(state.writes, ["status:In Progress"]);
  }).pipe(Effect.provide(database)),
);

it.effect("deduplicates findings and never reposts a comment after a lost response", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    state.tags = ["no agent"];
    const findings = {
      actionable: true as const,
      text: "I need the acceptance criteria for guest checkout.",
    };
    yield* service.findings(task, findings);
    yield* service.findings(task, findings);
    assert.equal(state.comments.length, 1);
    state.failComment = true;
    const second = { ...findings, text: "I need the expected currency." };
    assert.equal((yield* Effect.result(service.findings(task, second)))._tag, "Failure");
    state.failComment = false;
    assert.equal((yield* Effect.result(service.findings(task, second)))._tag, "Failure");
    assert.equal(state.comments.length, 2);
  }).pipe(Effect.provide(database)),
);

it.effect(
  "prepares durable evidence without publishing and excludes foreign or unregistered PRs",
  () =>
    Effect.gen(function* () {
      const { service, state } = yield* harness();
      assert.equal(
        (yield* Effect.result(
          service.prepare(task, threadId, {
            ...input,
            reviewedHeads: [{ url: "https://github.com/other/repo/pull/2", headSha: "abc" }],
          }),
        ))._tag,
        "Failure",
      );
      assert.equal(
        (yield* Effect.result(
          service.prepare(task, threadId, { ...input, evidence: input.evidence.slice(0, 1) }),
        ))._tag,
        "Failure",
      );
      const handoff = yield* service.prepare(task, threadId, input);
      assert.equal((yield* service.prepare(task, threadId, input)).id, handoff.id);
      assert.deepEqual(state.writes, []);
      assert.deepEqual(state.comments, []);
      assert.equal((yield* service.read(task)).handoffs[0]?.id, handoff.id);
      assert.equal(
        (yield* Effect.result(service.submit({ ...task, taskId: "other", handoffId: handoff.id })))
          ._tag,
        "Failure",
      );
    }).pipe(Effect.provide(database)),
);

it.effect("rejects changed or unlinked PR heads before any submit write", () =>
  Effect.gen(function* () {
    const { service, state, sql } = yield* harness();
    assert.equal(
      (yield* Effect.result(
        service.prepare(task, threadId, {
          ...input,
          reviewedHeads: [{ url, headSha: "old-head" }],
        }),
      ))._tag,
      "Failure",
    );
    const handoff = yield* service.prepare(task, threadId, input);
    state.status = "QA Testing";
    assert.equal(
      (yield* Effect.result(service.submit({ ...task, handoffId: handoff.id })))._tag,
      "Failure",
    );
    assert.deepEqual(state.writes, []);
    state.status = "In Progress";
    state.head = "new-head";
    const changed = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(changed.status, "partial");
    assert.include(changed.error, "changed after review");
    assert.deepEqual(state.writes, []);
    state.head = "abc";
    yield* sql`DELETE FROM projection_thread_pull_requests`;
    assert.include((yield* service.submit({ ...task, handoffId: handoff.id })).error, "unlinked");
  }).pipe(Effect.provide(database)),
);

it.effect("submits in order and repeated submit never duplicates final comments", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    const handoff = yield* service.prepare(task, threadId, input);
    const submitted = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(submitted.status, "submitted");
    assert.deepEqual(state.writes, ["ready", "reviewer", "status:Code Review"]);
    yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(state.comments.length, 1);
  }).pipe(Effect.provide(database)),
);

it.effect("persists partial PR progress and resumes only remaining provider operations", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    const handoff = yield* service.prepare(task, threadId, input);
    state.failReviewer = true;
    const partial = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(partial.status, "partial");
    assert.equal(partial.pullRequests[0]?.ready, true);
    assert.equal(partial.statusUpdated, false);
    assert.equal(state.comments.length, 0);
    state.failReviewer = false;
    assert.equal((yield* service.submit({ ...task, handoffId: handoff.id })).status, "submitted");
    assert.equal(state.writes.filter((item) => item === "ready").length, 1);
  }).pipe(Effect.provide(database)),
);

it.effect("does not request the author as reviewer and blocks ambiguous comment retries", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    state.author = "Vrybakk";
    const handoff = yield* service.prepare(task, threadId, input);
    state.failComment = true;
    const result = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(result.status, "uncertain");
    assert.equal(result.commentPosted, false);
    assert.equal(state.writes.includes("reviewer"), false);
    state.failComment = false;
    assert.equal((yield* service.submit({ ...task, handoffId: handoff.id })).status, "uncertain");
    assert.equal(state.comments.length, 1);
  }).pipe(Effect.provide(database)),
);

it.effect(
  "requires a concise waiver disclosure and keeps technical evidence out of the final comment",
  () =>
    Effect.gen(function* () {
      const { service, state } = yield* harness();
      const waived = {
        ...input,
        evidence: input.evidence.map((item) =>
          item.kind === "verification"
            ? {
                ...item,
                outcome: "waived" as const,
                details:
                  "Developer explicitly approved skipping browser verification because staging is unavailable.",
              }
            : item,
        ),
      };
      assert.equal((yield* Effect.result(service.prepare(task, threadId, waived)))._tag, "Failure");
      const handoff = yield* service.prepare(task, threadId, {
        ...waived,
        waiverSummary: "The developer approved skipping browser verification.",
      });
      yield* service.submit({ ...task, handoffId: handoff.id });
      assert.include(state.comments[0], "approved skipping browser verification");
      assert.notInclude(state.comments[0], "staging is unavailable");
    }).pipe(Effect.provide(database)),
);

it.effect("collects reviewed PRs across repositories but excludes other tasks", () =>
  Effect.gen(function* () {
    const { service, sql } = yield* harness();
    const apiUrl = "https://github.com/studio/api/pull/2";
    const foreignUrl = "https://github.com/studio/other/pull/3";
    yield* sql`INSERT INTO projection_threads VALUES ('api-thread', 'api-project', NULL), ('foreign-thread', 'foreign-project', NULL)`;
    yield* sql`INSERT INTO projection_thread_clickup_tasks VALUES ('api-thread', 'task', '42'), ('foreign-thread', 'other-task', '42')`;
    yield* sql`INSERT INTO projection_thread_pull_requests VALUES ('api-thread', 'github.com', 'studio/api', 2, ${apiUrl}), ('foreign-thread', 'github.com', 'studio/other', 3, ${foreignUrl})`;
    const handoff = yield* service.prepare(task, threadId, {
      ...input,
      reviewedHeads: [...input.reviewedHeads, { url: apiUrl, headSha: "abc" }],
    });
    assert.deepEqual(
      handoff.pullRequests.map((pr) => pr.repository),
      ["studio/repo", "studio/api"],
    );
    assert.equal(
      (yield* Effect.result(
        service.prepare(task, threadId, {
          ...input,
          reviewedHeads: [{ url: foreignUrl, headSha: "abc" }],
        }),
      ))._tag,
      "Failure",
    );
  }).pipe(Effect.provide(database)),
);

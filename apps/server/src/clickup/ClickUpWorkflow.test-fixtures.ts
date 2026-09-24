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
import { taskScopeFingerprint } from "./ClickUpTaskScope.ts";

export const task = { workspaceId: "42", taskId: "task", userId: 7 };
export const threadId = ThreadId.make("thread");
export const url = "https://github.com/studio/repo/pull/1";
export const input: ClickUpPrepareHandoffInput = {
  summary: "I implemented the requested change and verified the result.",
  reviewedTaskScope: taskScopeFingerprint({ ...task, name: "Task", description: "" }),
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
export const harness = Effect.fn("workflowHarness")(function* () {
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
    name: "Task",
    description: "",
    onReady: () => {},
    detailReads: 0,
    authorizationReads: 0,
    failReviewer: false,
    failComment: false,
    writes: [] as string[],
    comments: [] as string[],
  };
  const dependencies = Layer.mergeAll(
    Layer.succeed(SqlClient.SqlClient, sql),
    Layer.mock(ClickUpTasks)({
      authorize: (selected) =>
        Effect.sync(() => {
          state.authorizationReads++;
          if (selected.userId !== task.userId) throw new Error("Unexpected account");
        }),
      detail: (selected) =>
        selected.userId !== task.userId
          ? Effect.fail(new ClickUpError({ message: "Account changed" }))
          : Effect.sync(() => {
              state.detailReads++;
              return {
                task: {
                  ...task,
                  name: state.name,
                  status: state.status,
                  listName: "Sprint",
                  description: state.description,
                  tags: state.tags,
                },
                comments: [],
                commentsMayHaveMore: false,
                attachments: [],
              };
            }),
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
          state.onReady();
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
export const database = NodeSqliteClient.layer({ filename: ":memory:" });

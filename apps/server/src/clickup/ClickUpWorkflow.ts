import * as NodeCrypto from "node:crypto";
import {
  ClickUpError,
  ClickUpHandoff,
  ProjectId,
  type ClickUpTaskInput,
  type ClickUpWorkflow as Workflow,
  type ClickUpSubmitWorkflowInput,
  type ClickUpPrepareHandoffInput,
  type ClickUpFindingsInput,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Semaphore from "effect/Semaphore";
import { PullRequestService } from "../pullRequest/PullRequestService.ts";
import { ClickUpTasks } from "./ClickUpTasks.ts";
import { ClickUpTaskEditing } from "./ClickUpTaskEditing.ts";
import { decodeWorkflowText, handoffSummary, matchingHandoff } from "./ClickUpWorkflowEvidence.ts";
import { ClickUpWorkflowStore } from "./ClickUpWorkflowStore.ts";
import { taskScopeFingerprint } from "./ClickUpTaskScope.ts";
import { refreshHandoffPullRequest } from "./ClickUpWorkflowPullRequests.ts";

export class ClickUpWorkflow extends Context.Service<
  ClickUpWorkflow,
  {
    readonly read: (task: ClickUpTaskInput) => Effect.Effect<Workflow, ClickUpError>;
    readonly start: (task: ClickUpTaskInput) => Effect.Effect<void, ClickUpError>;
    readonly findings: (
      task: ClickUpTaskInput,
      input: ClickUpFindingsInput,
    ) => Effect.Effect<void, ClickUpError>;
    readonly prepare: (
      task: ClickUpTaskInput,
      threadId: ThreadId,
      input: ClickUpPrepareHandoffInput,
    ) => Effect.Effect<ClickUpHandoff, ClickUpError>;
    readonly submit: (
      input: ClickUpSubmitWorkflowInput,
    ) => Effect.Effect<ClickUpHandoff, ClickUpError>;
  }
>()("t3/clickup/ClickUpWorkflow") {}

export const layer = Layer.effect(
  ClickUpWorkflow,
  Effect.gen(function* () {
    const tasks = yield* ClickUpTasks;
    const editing = yield* ClickUpTaskEditing;
    const store = yield* ClickUpWorkflowStore;
    const prs = yield* PullRequestService;
    const gate = yield* Semaphore.make(1);
    const failure = (message: string) => new ClickUpError({ message });
    const current = Effect.fn("ClickUpWorkflow.current")(function* (task: ClickUpTaskInput) {
      const details = yield* tasks.detail(task);
      if (
        (details.metadata?.tags ?? details.task.tags ?? []).some(
          (tag) => tag.trim().toLowerCase() === "no agent",
        )
      )
        return yield* failure(
          "This task has the no agent tag. Remove it in ClickUp before starting an agent workflow.",
        );
      return details;
    });
    const status = Effect.fn("ClickUpWorkflow.status")(function* (
      task: ClickUpTaskInput,
      name: string,
    ) {
      const options = yield* editing.options(task);
      const target = options.statuses.find(
        (item) => item.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (!target) return yield* failure(`The task's list does not have a ${name} status.`);
      if (options.status !== target.name)
        yield* editing.setStatus({ ...task, status: target.name });
    });
    const read = Effect.fn("ClickUpWorkflow.read")(function* (task: ClickUpTaskInput) {
      yield* tasks.authorize(task);
      return { handoffs: yield* store.list(task) };
    });
    const start = Effect.fn("ClickUpWorkflow.start")(function* (task: ClickUpTaskInput) {
      const details = yield* current(task);
      if (
        !["open", "to do", "todo", "not started", "backlog", "pending", "in progress"].includes(
          details.task.status.trim().toLowerCase(),
        )
      )
        return yield* failure(
          "This task is already past implementation or its status is unfamiliar. Ask the developer before changing it.",
        );
      yield* status(task, "In Progress");
    });
    const findings = Effect.fn("ClickUpWorkflow.findings")(function* (
      task: ClickUpTaskInput,
      input: ClickUpFindingsInput,
    ) {
      yield* tasks.detail(task);
      const text = yield* decodeWorkflowText(input.text.replace(/\r\n?/g, "\n")).pipe(
        Effect.mapError(() =>
          failure("Use up to four plain English lines without we or long dashes."),
        ),
      );
      if (!input.actionable) return yield* failure("Only actionable findings may be posted.");
      yield* store.postOnce(task, `findings:${text}`, text);
    });
    const prepare = Effect.fn("ClickUpWorkflow.prepare")(function* (
      task: ClickUpTaskInput,
      threadId: ThreadId,
      input: ClickUpPrepareHandoffInput,
    ) {
      const details = yield* current(task);
      const scope = taskScopeFingerprint(details.task);
      if (input.reviewedTaskScope !== scope)
        return yield* failure(
          "The task title or description changed since review. Reconcile the requirements and review the current scope before preparing a handoff.",
        );
      const summary = yield* handoffSummary(input);
      const registered = yield* store.registered(task);
      const pullRequests: Array<ClickUpHandoff["pullRequests"][number]> = [];
      for (const { url, headSha } of input.reviewedHeads) {
        const link = registered.find((item) => item.url === url);
        if (!link)
          return yield* failure(
            "Every handoff PR must be registered to a nondeleted thread linked to this ClickUp task.",
          );
        const ref = {
          projectId: ProjectId.make(link.projectId),
          host: link.host,
          repository: link.repository,
          number: link.number,
        };
        const detail = yield* refreshHandoffPullRequest(prs, ref);
        if (detail.headSha !== headSha)
          return yield* failure(
            "A PR changed since the recorded review. Review its current head before preparing a handoff.",
          );
        pullRequests.push({
          ...ref,
          url: link.url,
          headSha: detail.headSha,
          ready: !detail.isDraft,
          reviewerRequested: detail.reviewers.some(
            (reviewer) => reviewer.login.toLowerCase() === "vrybakk",
          ),
        });
      }
      const existing = yield* store.list(task);
      const same = matchingHandoff(existing, {
        threadId,
        taskScopeFingerprint: scope,
        summary,
        evidence: input.evidence,
        pullRequests,
      });
      if (same) return same;
      const handoff: ClickUpHandoff = {
        id: NodeCrypto.randomUUID(),
        threadId,
        taskScopeFingerprint: scope,
        summary,
        evidence: input.evidence,
        createdAt: DateTime.formatIso(yield* DateTime.now),
        status: "pending",
        error: null,
        pullRequests,
        statusUpdated: false,
        commentPosted: false,
      };
      yield* store.save(task, handoff);
      return handoff;
    });
    const submit = Effect.fn("ClickUpWorkflow.submit")(function* (
      task: ClickUpSubmitWorkflowInput,
    ) {
      const taskDetails = yield* current(task);
      const found = (yield* store.list(task)).find((item) => item.id === task.handoffId);
      if (!found)
        return yield* failure(
          "This handoff does not belong to the current ClickUp account and task.",
        );
      if (found.status === "submitted" || found.status === "uncertain") return found;
      const checkScope = (fingerprint: string) =>
        found.taskScopeFingerprint === fingerprint
          ? Effect.void
          : Effect.fail(
              failure(
                "The task title or description changed, or this handoff predates scope checks. Reconcile the requirements and prepare a new handoff before submitting.",
              ),
            );
      if (!["in progress", "code review"].includes(taskDetails.task.status.trim().toLowerCase()))
        return yield* failure(
          "Submit requires In Progress or Code Review. The task status changed; review it before submitting.",
        );
      let receipt: ClickUpHandoff = Object.assign({}, found, {
        status: "partial" as const,
        error: null,
      });
      const save = () => store.save(task, receipt);
      yield* save();
      const run = Effect.gen(function* () {
        yield* checkScope(taskScopeFingerprint(taskDetails.task));
        const registered = yield* store.registered(task);
        for (const pr of receipt.pullRequests) {
          if (!registered.some((item) => item.url === pr.url && item.projectId === pr.projectId))
            return yield* failure("A handoff PR was unlinked. Prepare a new handoff.");
          const live = yield* refreshHandoffPullRequest(prs, pr);
          if (live.headSha !== pr.headSha)
            return yield* failure(
              "A PR changed after review. Review the new head and prepare a new handoff.",
            );
        }
        for (let index = 0; index < receipt.pullRequests.length; index++) {
          const pr = receipt.pullRequests[index]!;
          let live = yield* refreshHandoffPullRequest(prs, pr);
          if (live.headSha !== pr.headSha)
            return yield* failure(
              "A PR changed during submission. Review the new head before continuing.",
            );
          yield* checkScope(taskScopeFingerprint((yield* current(task)).task));
          if (live.isDraft)
            yield* prs
              .runAction({ ...pr, action: "ready" })
              .pipe(Effect.mapError((error) => failure(error.message)));
          receipt = Object.assign({}, receipt, {
            pullRequests: receipt.pullRequests.map((item, i) =>
              i === index ? { ...item, ready: true } : item,
            ),
          });
          yield* save();
          live = yield* refreshHandoffPullRequest(prs, pr);
          if (live.headSha !== pr.headSha)
            return yield* failure(
              "A PR changed during submission. Review the new head before continuing.",
            );
          if (
            live.author?.login.toLowerCase() !== "vrybakk" &&
            !live.reviewers.some((reviewer) => reviewer.login.toLowerCase() === "vrybakk")
          ) {
            yield* checkScope(taskScopeFingerprint((yield* current(task)).task));
            yield* prs
              .requestReviewers({
                ...pr,
                reviewers: [{ id: "vrybakk", kind: "user" }],
                requested: true,
              })
              .pipe(Effect.mapError((error) => failure(error.message)));
          }
          receipt = Object.assign({}, receipt, {
            pullRequests: receipt.pullRequests.map((item, i) =>
              i === index
                ? { ...item, reviewerRequested: live.author?.login.toLowerCase() !== "vrybakk" }
                : item,
            ),
          });
          yield* save();
        }
        for (const pr of receipt.pullRequests) {
          if ((yield* refreshHandoffPullRequest(prs, pr)).headSha !== pr.headSha)
            return yield* failure(
              "A PR changed during submission. Review the new head before continuing.",
            );
        }
        const latestTask = yield* current(task);
        yield* checkScope(taskScopeFingerprint(latestTask.task));
        if (!["in progress", "code review"].includes(latestTask.task.status.trim().toLowerCase()))
          return yield* failure(
            "The task status changed during submission. Review it before continuing.",
          );
        yield* status(task, "Code Review");
        receipt = Object.assign({}, receipt, { statusUpdated: true });
        yield* save();
        // An unconfirmed comment cannot be retried even if the process loses its final receipt.
        receipt = Object.assign({}, receipt, { status: "uncertain" as const });
        yield* save();
        yield* store.postOnce(task, `handoff:${receipt.id}`, receipt.summary);
        receipt = Object.assign({}, receipt, {
          status: "submitted" as const,
          commentPosted: true,
          error: null,
        });
        yield* save();
      });
      yield* run.pipe(
        Effect.catchTag("ClickUpError", (error) =>
          Effect.gen(function* () {
            receipt = Object.assign({}, receipt, { error: error.message });
            yield* save();
          }),
        ),
      );
      return receipt;
    });
    return ClickUpWorkflow.of({
      read,
      start: (task) => start(task).pipe(gate.withPermit),
      findings: (task, input) => findings(task, input).pipe(gate.withPermit),
      prepare: (task, threadId, input) => prepare(task, threadId, input).pipe(gate.withPermit),
      submit: (input) => submit(input).pipe(gate.withPermit),
    });
  }),
);

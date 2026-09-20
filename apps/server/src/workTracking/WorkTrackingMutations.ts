import {
  type WorkDelivery,
  type WorkManualEntryInput,
  type WorkProfile,
  type WorkProfileInput,
  type WorkRepository,
  type WorkRepositoryInput,
  type WorkTrackingProject,
  type WorkProjectInput,
  WorkRecord,
  WorkTrackingError,
} from "@t3tools/contracts";
import { isIanaTimeZone } from "@t3tools/shared/workTimeWindow";
// @effect-diagnostics nodeBuiltinImport:off -- realpath prevents repository symlink escapes.
import * as NodeFSP from "node:fs/promises";
import * as Clock from "effect/Clock";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { isWithinWorkspaceRoot } from "./WorkTrackingDiscovery.ts";
import type { AutomaticWorkRecordInput } from "./WorkTrackingService.ts";

const nowIso = (milliseconds: number) => DateTime.formatIso(DateTime.makeUnsafe(milliseconds));
const failure = (message: string) => new WorkTrackingError({ message });
const mapSqlError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchCause(() => Effect.fail(failure("Could not update the local work ledger."))),
  );
const encodeToolUsage = Schema.encodeSync(
  Schema.fromJsonString(
    Schema.Struct({ uses: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
  ),
);
const isGitRepository = async (root: string) => {
  const git = await NodeFSP.lstat(`${root}/.git`);
  return git.isDirectory() || git.isFile();
};

interface Dependencies {
  readonly sql: SqlClient.SqlClient;
  readonly crypto: Crypto.Crypto;
  readonly readProfile: Effect.Effect<WorkProfile | null, WorkTrackingError>;
  readonly readRepositories: (
    trackingProjectId?: string,
  ) => Effect.Effect<ReadonlyArray<WorkRepository>, WorkTrackingError>;
}

export const makeWorkTrackingMutations = ({
  sql,
  crypto,
  readProfile,
  readRepositories,
}: Dependencies) => {
  const upsertProfile = Effect.fn("WorkTrackingService.upsertProfile")(function* (
    input: WorkProfileInput,
  ) {
    if (!isIanaTimeZone(input.timeZone))
      return yield* Effect.fail(failure("Reporting timezone must be a valid IANA timezone."));
    const existing = yield* readProfile;
    const now = nowIso(yield* Clock.currentTimeMillis);
    const id = existing?.id ?? (yield* crypto.randomUUIDv4);
    yield* mapSqlError(
      sql`INSERT INTO work_profiles(id, display_name, time_zone, tracking_enabled, created_at, updated_at) VALUES (${id}, ${input.displayName}, ${input.timeZone}, ${input.trackingEnabled ? 1 : 0}, ${existing?.createdAt ?? now}, ${now}) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, time_zone = excluded.time_zone, tracking_enabled = excluded.tracking_enabled, updated_at = excluded.updated_at`,
    );
    return { id, ...input, createdAt: existing?.createdAt ?? now, updatedAt: now } as WorkProfile;
  });
  const upsertProject = Effect.fn("WorkTrackingService.upsertProject")(function* (
    input: WorkProjectInput,
  ) {
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const now = nowIso(yield* Clock.currentTimeMillis);
        const id = input.id ?? (yield* crypto.randomUUIDv4);
        const existing = input.id
          ? (yield* mapSqlError(
              sql<{
                readonly createdAt: string;
              }>`SELECT created_at AS "createdAt" FROM work_tracking_projects WHERE id = ${id}`,
            ))[0]
          : undefined;
        if (new Set(input.t3ProjectIds).size !== input.t3ProjectIds.length)
          return yield* Effect.fail(failure("A T3 project can only be bound once."));
        const conflicts =
          input.t3ProjectIds.length === 0
            ? []
            : yield* mapSqlError(
                sql<{
                  readonly projectId: string;
                }>`SELECT project_id AS "projectId" FROM work_tracking_project_bindings WHERE ${sql.in("project_id", input.t3ProjectIds)} AND tracking_project_id != ${id}`,
              );
        if (conflicts.length > 0)
          return yield* Effect.fail(
            failure("A T3 project is already bound to another tracking project."),
          );
        yield* mapSqlError(
          sql`INSERT INTO work_tracking_projects(id, name, tracking_enabled, created_at, updated_at) VALUES (${id}, ${input.name}, ${input.trackingEnabled ? 1 : 0}, ${existing?.createdAt ?? now}, ${now}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, tracking_enabled = excluded.tracking_enabled, updated_at = excluded.updated_at`,
        );
        yield* mapSqlError(
          sql`DELETE FROM work_tracking_project_bindings WHERE tracking_project_id = ${id}`,
        );
        yield* Effect.forEach(input.t3ProjectIds, (projectId) =>
          mapSqlError(
            sql`INSERT INTO work_tracking_project_bindings(tracking_project_id, project_id) VALUES (${id}, ${projectId})`,
          ),
        );
        const repositories = yield* readRepositories(id);
        return {
          id,
          name: input.name,
          t3ProjectIds: input.t3ProjectIds,
          trackingEnabled: input.trackingEnabled,
          repositories,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        } as unknown as WorkTrackingProject;
      }),
    );
  });
  const upsertRepository = Effect.fn("WorkTrackingService.upsertRepository")(function* (
    input: WorkRepositoryInput,
  ) {
    const roots = yield* mapSqlError(
      sql<{
        readonly localRoot: string;
      }>`SELECT projects.workspace_root AS "localRoot" FROM work_tracking_project_bindings AS bindings JOIN projection_projects AS projects ON projects.project_id = bindings.project_id WHERE bindings.tracking_project_id = ${input.trackingProjectId} AND projects.deleted_at IS NULL`,
    );
    const normalized = yield* Effect.tryPromise({
      try: async () => ({
        candidate: await NodeFSP.realpath(input.localRoot),
        roots: await Promise.all(roots.map((root) => NodeFSP.realpath(root.localRoot))),
      }),
      catch: () => failure("Repository root must exist inside a bound workspace."),
    });
    if (!normalized.roots.some((root) => isWithinWorkspaceRoot(root, normalized.candidate)))
      return yield* Effect.fail(failure("Repository must be inside a bound workspace root."));
    const git = yield* Effect.tryPromise({
      try: () => isGitRepository(normalized.candidate),
      catch: () => failure("Repository root must contain Git metadata."),
    });
    if (!git) return yield* Effect.fail(failure("Repository root must contain Git metadata."));
    if (input.id) {
      const existing = (yield* mapSqlError(
        sql<{
          readonly trackingProjectId: string;
        }>`SELECT tracking_project_id AS "trackingProjectId" FROM work_repositories WHERE id = ${input.id}`,
      ))[0];
      if (!existing) return yield* Effect.fail(failure("Repository not found."));
      if (existing.trackingProjectId !== input.trackingProjectId)
        return yield* Effect.fail(failure("Repository belongs to another tracking project."));
    }
    const repositoryByRoot = input.id
      ? undefined
      : (yield* mapSqlError(
          sql<{
            readonly id: string;
            readonly createdAt: string;
          }>`SELECT id, created_at AS "createdAt" FROM work_repositories WHERE tracking_project_id = ${input.trackingProjectId} AND local_root = ${normalized.candidate}`,
        ))[0];
    const now = nowIso(yield* Clock.currentTimeMillis);
    const id = input.id ?? repositoryByRoot?.id ?? (yield* crypto.randomUUIDv4);
    yield* mapSqlError(
      sql`INSERT INTO work_repositories(id, tracking_project_id, local_root, canonical_identity, inclusion, provenance, created_at, updated_at) VALUES (${id}, ${input.trackingProjectId}, ${normalized.candidate}, ${input.canonicalIdentity ?? null}, ${input.inclusion}, ${input.provenance}, ${now}, ${now}) ON CONFLICT(id) DO UPDATE SET local_root = excluded.local_root, canonical_identity = excluded.canonical_identity, inclusion = excluded.inclusion, provenance = excluded.provenance, updated_at = excluded.updated_at`,
    );
    return {
      id,
      ...input,
      localRoot: normalized.candidate,
      canonicalIdentity: input.canonicalIdentity ?? null,
      createdAt: repositoryByRoot?.createdAt ?? now,
      updatedAt: now,
    } as unknown as WorkRepository;
  });
  const upsertManualEntry = Effect.fn("WorkTrackingService.upsertManualEntry")(function* (
    input: WorkManualEntryInput,
  ) {
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const now = nowIso(yield* Clock.currentTimeMillis);
        if (input.crossRepository && input.repositoryId)
          return yield* Effect.fail(
            failure("Cross-repository entries cannot select one repository."),
          );
        if (input.repositoryId) {
          const repository = (yield* mapSqlError(
            sql<{
              readonly id: string;
            }>`SELECT id FROM work_repositories WHERE id = ${input.repositoryId} AND tracking_project_id = ${input.trackingProjectId} AND inclusion = 'included'`,
          ))[0];
          if (!repository)
            return yield* Effect.fail(
              failure("Repository must be included in this tracking project."),
            );
        }
        if (input.threadId) {
          const thread = (yield* mapSqlError(
            sql<{
              readonly id: string;
            }>`SELECT threads.thread_id AS id FROM projection_threads AS threads JOIN work_tracking_project_bindings AS bindings ON bindings.project_id = threads.project_id WHERE threads.thread_id = ${input.threadId} AND bindings.tracking_project_id = ${input.trackingProjectId}`,
          ))[0];
          if (!thread)
            return yield* Effect.fail(failure("Thread is not bound to this tracking project."));
        }
        const id = yield* crypto.randomUUIDv4;
        const prior =
          input.id === undefined
            ? null
            : ((yield* mapSqlError(
                sql<{
                  readonly id: string;
                  readonly revision: number;
                  readonly trackingProjectId: string;
                }>`SELECT id, revision, tracking_project_id AS "trackingProjectId" FROM work_records WHERE id = ${input.id} AND kind = 'manual' AND supersedes_id IS NULL`,
              ))[0] ?? null);
        if (input.id && !prior)
          return yield* Effect.fail(failure("Manual entry is not a current record."));
        if (prior && prior.trackingProjectId !== input.trackingProjectId)
          return yield* Effect.fail(failure("Manual entry belongs to another tracking project."));
        yield* mapSqlError(
          sql`INSERT INTO work_records(id, kind, tracking_project_id, thread_id, repository_id, cross_repository, occurred_at, duration_ms, outcome, coverage, category, note, revision, supersedes_id, created_at, updated_at) VALUES (${id}, 'manual', ${input.trackingProjectId}, ${input.threadId ?? null}, ${input.repositoryId ?? null}, ${input.crossRepository ? 1 : 0}, ${input.occurredAt}, ${input.durationMs}, 'succeeded', 'complete', ${input.category ?? null}, ${input.note ?? null}, ${(prior?.revision ?? -1) + 1}, NULL, ${now}, ${now})`,
        );
        if (prior)
          yield* mapSqlError(
            sql`UPDATE work_records SET supersedes_id = ${id}, updated_at = ${now} WHERE id = ${prior.id}`,
          );
        return {
          id,
          kind: "manual",
          trackingProjectId: input.trackingProjectId,
          projectId: null,
          threadId: input.threadId ?? null,
          turnId: null,
          repositoryId: input.repositoryId ?? null,
          crossRepository: input.crossRepository ?? false,
          occurredAt: input.occurredAt,
          durationMs: input.durationMs,
          elapsedMs: null,
          activeMs: null,
          waitingMs: null,
          taskMs: null,
          provider: null,
          model: null,
          effort: null,
          surface: null,
          tokens: {
            inputTokens: null,
            cachedInputTokens: null,
            outputTokens: null,
            reasoningTokens: null,
          },
          toolUsage: null,
          outcome: "succeeded",
          coverage: "complete",
          category: input.category ?? null,
          note: input.note ?? null,
          sourceEventId: null,
          revision: (prior?.revision ?? -1) + 1,
          supersedesId: null,
          createdAt: now,
          updatedAt: now,
        } as unknown as WorkRecord;
      }),
    );
  });
  const recordAutomatic = Effect.fn("WorkTrackingService.recordAutomatic")(function* (
    input: AutomaticWorkRecordInput,
  ) {
    const profile = yield* readProfile;
    if (!profile?.trackingEnabled) return;
    const project = yield* mapSqlError(
      sql<{
        readonly id: string;
      }>`SELECT tracking_project_id AS id FROM work_tracking_project_bindings JOIN work_tracking_projects ON work_tracking_projects.id = tracking_project_id WHERE project_id = ${input.projectId} AND work_tracking_projects.tracking_enabled = 1 LIMIT 1`,
    ).pipe(Effect.map((rows) => rows[0]));
    if (!project) return;
    const repositoryCandidates = yield* mapSqlError(
      sql<{
        readonly id: string;
        readonly localRoot: string;
        readonly workspaceRoot: string;
      }>`SELECT repositories.id, repositories.local_root AS "localRoot", projects.workspace_root AS "workspaceRoot" FROM work_repositories AS repositories JOIN work_tracking_project_bindings AS bindings ON bindings.tracking_project_id = repositories.tracking_project_id JOIN projection_projects AS projects ON projects.project_id = bindings.project_id WHERE repositories.tracking_project_id = ${project.id} AND bindings.project_id = ${input.projectId} AND repositories.inclusion = 'included' AND projects.deleted_at IS NULL`,
    );
    const repositoryIds = [
      ...new Set(
        repositoryCandidates
          .filter((repository) =>
            isWithinWorkspaceRoot(repository.workspaceRoot, repository.localRoot),
          )
          .map((repository) => repository.id),
      ),
    ];
    const repositoryId = repositoryIds.length === 1 ? repositoryIds[0] : null;
    const crossRepository = repositoryIds.length > 1;
    const id = yield* crypto.randomUUIDv4;
    yield* mapSqlError(
      sql`INSERT INTO work_records(id, kind, tracking_project_id, project_id, thread_id, turn_id, repository_id, cross_repository, occurred_at, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, elapsed_ms, task_ms, provider, model, effort, tool_usage_json, outcome, coverage, source_event_id, revision, created_at, updated_at) VALUES (${id}, ${input.kind}, ${project.id}, ${input.projectId}, ${input.threadId}, ${input.turnId}, ${repositoryId}, ${crossRepository ? 1 : 0}, ${input.occurredAt}, ${input.inputTokens}, ${input.cachedInputTokens}, ${input.outputTokens}, ${input.reasoningTokens}, ${input.elapsedMs}, ${input.taskMs}, ${input.provider}, ${input.model}, ${input.effort}, ${input.toolUses === null ? null : encodeToolUsage({ uses: input.toolUses })}, ${input.outcome}, ${input.coverage}, ${input.sourceEventId}, 0, ${input.occurredAt}, ${input.occurredAt}) ON CONFLICT(source_event_id) DO NOTHING`,
    );
  });
  const readDelivery = (id: string) =>
    mapSqlError(
      sql<WorkDelivery>`SELECT id, tracking_project_id AS "trackingProjectId", thread_id AS "threadId", status, delivered_at AS "deliveredAt", reopened_at AS "reopenedAt", created_at AS "createdAt", updated_at AS "updatedAt" FROM work_deliveries WHERE id = ${id}`,
    ).pipe(
      Effect.flatMap((rows) =>
        rows[0] === undefined
          ? Effect.fail(failure("Delivery not found."))
          : Effect.succeed(rows[0]),
      ),
    );
  const markDelivery = Effect.fn("WorkTrackingService.markDelivery")(function* (
    trackingProjectId: string,
    threadId: string | null,
  ) {
    if (threadId) {
      const thread = (yield* mapSqlError(
        sql<{
          readonly id: string;
        }>`SELECT threads.thread_id AS id FROM projection_threads AS threads JOIN work_tracking_project_bindings AS bindings ON bindings.project_id = threads.project_id WHERE threads.thread_id = ${threadId} AND bindings.tracking_project_id = ${trackingProjectId}`,
      ))[0];
      if (!thread)
        return yield* Effect.fail(failure("Thread is not bound to this tracking project."));
    }
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const now = nowIso(yield* Clock.currentTimeMillis);
        const open = (yield* mapSqlError(
          sql<{
            readonly id: string;
          }>`SELECT id FROM work_deliveries WHERE tracking_project_id = ${trackingProjectId} AND thread_id IS ${threadId} AND status = 'open' ORDER BY created_at DESC LIMIT 1`,
        ))[0];
        if (open) {
          yield* mapSqlError(
            sql`UPDATE work_deliveries SET status = 'delivered', delivered_at = ${now}, updated_at = ${now} WHERE id = ${open.id}`,
          );
          return yield* readDelivery(open.id);
        }
        const id = yield* crypto.randomUUIDv4;
        yield* mapSqlError(
          sql`INSERT INTO work_deliveries(id, tracking_project_id, thread_id, status, delivered_at, reopened_at, created_at, updated_at) VALUES (${id}, ${trackingProjectId}, ${threadId}, 'delivered', ${now}, NULL, ${now}, ${now})`,
        );
        return yield* readDelivery(id);
      }),
    );
  });
  const reopenDelivery = Effect.fn("WorkTrackingService.reopenDelivery")(function* (id: string) {
    const delivery = yield* readDelivery(id);
    if (delivery.status !== "delivered")
      return yield* Effect.fail(failure("Only a delivered cycle can be reopened."));
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const open = (yield* mapSqlError(
          sql<{
            readonly id: string;
          }>`SELECT id FROM work_deliveries WHERE tracking_project_id = ${delivery.trackingProjectId} AND thread_id IS ${delivery.threadId} AND status = 'open' LIMIT 1`,
        ))[0];
        if (open) return yield* Effect.fail(failure("An open delivery cycle already exists."));
        const now = nowIso(yield* Clock.currentTimeMillis);
        const reopenedId = yield* crypto.randomUUIDv4;
        yield* mapSqlError(
          sql`INSERT INTO work_deliveries(id, tracking_project_id, thread_id, status, delivered_at, reopened_at, created_at, updated_at) VALUES (${reopenedId}, ${delivery.trackingProjectId}, ${delivery.threadId}, 'open', NULL, ${now}, ${now}, ${now})`,
        );
        return yield* readDelivery(reopenedId);
      }),
    );
  });
  return {
    upsertProfile,
    upsertProject,
    upsertRepository,
    upsertManualEntry,
    recordAutomatic,
    markDelivery,
    reopenDelivery,
  };
};

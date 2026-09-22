import { assert, it } from "@effect/vitest";
import { ProjectId } from "@t3tools/contracts";
import { WorkOverview } from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Schema from "effect/Schema";

import { runMigrations } from "../persistence/Migrations.ts";
import { WorkTrackingService, layer } from "./WorkTrackingService.ts";

let nonce = 0;
const crypto = Crypto.make({
  randomBytes: (size) => {
    const bytes = new Uint8Array(size);
    bytes[0] = nonce & 0xff;
    bytes[1] = (nonce >>> 8) & 0xff;
    nonce += 1;
    return bytes;
  },
  digest: (_algorithm, bytes) => Effect.succeed(bytes),
});
const dependencies = Layer.mergeAll(
  NodeSqliteClient.layer({ filename: ":memory:" }),
  Layer.succeed(Crypto.Crypto, crypto),
);
const testLayer = Layer.mergeAll(dependencies, layer.pipe(Layer.provide(dependencies)));
const encodeWorkOverview = Schema.encodeEffect(WorkOverview);
const makeTestLayer = () => {
  const testDependencies = Layer.mergeAll(
    NodeSqliteClient.layer({ filename: ":memory:" }),
    Layer.succeed(Crypto.Crypto, crypto),
  );
  return Layer.mergeAll(testDependencies, layer.pipe(Layer.provide(testDependencies)));
};

it.effect("keeps manual, main, and task totals distinct while source records stay idempotent", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 54 });
    const work = yield* WorkTrackingService;
    yield* work.upsertProfile({ displayName: "Developer", timeZone: "UTC", trackingEnabled: true });
    const project = yield* work.upsertProject({
      name: "Ledger",
      t3ProjectIds: [ProjectId.make("t3-project")],
      trackingEnabled: true,
    });
    const saved = yield* work.upsertProject({
      id: project.id,
      name: "Ledger updated",
      t3ProjectIds: [ProjectId.make("t3-project")],
      trackingEnabled: true,
    });
    assert.equal(saved.createdAt, project.createdAt);
    yield* work.upsertManualEntry({
      trackingProjectId: project.id,
      occurredAt: "2026-09-01T12:00:00.000Z",
      durationMs: 600,
    });
    const automatic = {
      projectId: "t3-project",
      threadId: "thread",
      turnId: "turn",
      sourceEventId: "event-main",
      occurredAt: "2026-09-01T13:00:00.000Z",
      provider: "codex",
      outcome: "succeeded" as const,
      coverage: "complete" as const,
      inputTokens: 1,
      cachedInputTokens: 0,
      outputTokens: 2,
      reasoningTokens: 3,
      elapsedMs: 300,
      taskMs: null,
      model: null,
      effort: null,
      toolUses: 4,
    };
    yield* work.recordAutomatic({ ...automatic, kind: "agent-turn" });
    yield* work.recordAutomatic({ ...automatic, kind: "agent-turn" });
    yield* work.recordAutomatic({
      ...automatic,
      kind: "agent-task",
      sourceEventId: "event-task",
      elapsedMs: null,
      taskMs: 200,
    });
    const overview = yield* work.overview({
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-09-02T00:00:00.000Z",
    });
    assert.equal(overview.totals.manualMs, 600);
    assert.equal(overview.totals.agentElapsedMs, 300);
    assert.equal(overview.totals.agentTaskMs, 200);
    assert.equal(overview.totals.inputTokens, 2);
    assert.equal(overview.totals.cachedInputTokens, 0);
    assert.equal(overview.totals.outputTokens, 4);
    assert.equal(overview.totals.reasoningTokens, 6);
    assert.equal(overview.totals.toolUses, 8);
    assert.equal(overview.totals.records, 3);
  }).pipe(Effect.provide(testLayer)),
);

it.effect("attributes automatic work to one repository or cross-repository evidence", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 54 });
    const sql = yield* SqlClient.SqlClient;
    const work = yield* WorkTrackingService;
    yield* work.upsertProfile({ displayName: "Developer", timeZone: "UTC", trackingEnabled: true });
    yield* sql`INSERT INTO projection_projects(project_id, title, workspace_root, scripts_json, created_at, updated_at) VALUES ('t3-project', 'Project', '/workspace', '[]', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`;
    const project = yield* work.upsertProject({
      name: "Ledger",
      t3ProjectIds: [ProjectId.make("t3-project")],
      trackingEnabled: true,
    });
    yield* sql`INSERT INTO work_repositories(id, tracking_project_id, local_root, canonical_identity, inclusion, provenance, created_at, updated_at) VALUES ('repository-a', ${project.id}, '/workspace/repository-a', NULL, 'included', 'manual', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'), ('repository-b', ${project.id}, '/workspace/repository-b', NULL, 'included', 'manual', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`;
    const automatic = {
      kind: "agent-turn" as const,
      projectId: "t3-project",
      threadId: "thread",
      turnId: "turn",
      occurredAt: "2026-09-01T12:00:00.000Z",
      provider: "codex",
      outcome: "succeeded" as const,
      coverage: "complete" as const,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      elapsedMs: 100,
      taskMs: null,
      model: null,
      effort: null,
      toolUses: null,
    };
    yield* work.recordAutomatic({ ...automatic, sourceEventId: "event-cross-repository" });
    yield* sql`DELETE FROM work_repositories WHERE id = 'repository-b'`;
    yield* work.recordAutomatic({ ...automatic, sourceEventId: "event-single-repository" });
    const records = (yield* work.overview({
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-09-02T00:00:00.000Z",
    })).records;
    const crossRepository = records.find(
      (record) => record.sourceEventId === "event-cross-repository",
    );
    const singleRepository = records.find(
      (record) => record.sourceEventId === "event-single-repository",
    );

    assert.equal(crossRepository?.repositoryId, null);
    assert.equal(crossRepository?.crossRepository, true);
    assert.equal(singleRepository?.repositoryId, "repository-a");
    assert.equal(singleRepository?.crossRepository, false);
  }).pipe(Effect.provide(makeTestLayer())),
);

it.effect(
  "returns SQLite flags as schema-valid booleans and calculates coverage beyond record paging",
  () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 54 });
      const sql = yield* SqlClient.SqlClient;
      const work = yield* WorkTrackingService;
      yield* work.upsertProfile({
        displayName: "Developer",
        timeZone: "UTC",
        trackingEnabled: true,
      });
      const project = yield* work.upsertProject({
        name: "Ledger",
        t3ProjectIds: [],
        trackingEnabled: true,
      });
      yield* Effect.forEach(
        Array.from({ length: 501 }, (_, index) => index),
        (index) =>
          sql`INSERT INTO work_records(id, kind, tracking_project_id, cross_repository, occurred_at, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, tool_usage_json, elapsed_ms, active_ms, outcome, coverage, revision, created_at, updated_at) VALUES (${`turn-${index}`}, 'agent-turn', ${project.id}, 0, ${`2026-09-01T00:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`}, 1, 2, 3, 4, '{"uses":5}', 1, ${index === 0 ? null : 1}, 'succeeded', 'complete', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
      );
      const overview = yield* work.overview({
        since: "2026-09-01T00:00:00.000Z",
        until: "2026-09-02T00:00:00.000Z",
      });
      assert.equal(typeof overview.profile?.trackingEnabled, "boolean");
      assert.equal(typeof overview.projects[0]?.trackingEnabled, "boolean");
      assert.equal(overview.records.length, 500);
      assert.equal(overview.totals.inputTokens, 501);
      assert.equal(overview.totals.cachedInputTokens, 1_002);
      assert.equal(overview.totals.outputTokens, 1_503);
      assert.equal(overview.totals.reasoningTokens, 2_004);
      assert.equal(overview.totals.toolUses, 2_505);
      assert.deepEqual(overview.dailyTotals, [
        {
          date: "2026-09-01",
          trackingProjectId: project.id,
          developerMs: 0,
          agentElapsedMs: 501,
          taskMs: 0,
        },
      ]);
      const csv = yield* work.exportCsv(undefined, "2026-09");
      assert.equal(csv.content.split("\n").length, 502);
      assert.include(csv.content, '"Ledger"');
      assert.equal(overview.timeCoverage.active, "partial");
      assert.equal(overview.timeCoverage.waiting, "unavailable");
      assert.ok(yield* encodeWorkOverview(overview));
    }).pipe(Effect.provide(makeTestLayer())),
);

it.effect(
  "groups daily project totals in the profile timezone and exports all current project records",
  () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 54 });
      const sql = yield* SqlClient.SqlClient;
      const work = yield* WorkTrackingService;
      yield* work.upsertProfile({
        displayName: "Developer",
        timeZone: "Europe/Madrid",
        trackingEnabled: true,
      });
      const first = yield* work.upsertProject({
        name: "First project",
        t3ProjectIds: [],
        trackingEnabled: true,
      });
      const second = yield* work.upsertProject({
        name: "Second project",
        t3ProjectIds: [],
        trackingEnabled: true,
      });
      const original = yield* work.upsertManualEntry({
        trackingProjectId: first.id,
        occurredAt: "2026-09-01T22:30:00.000Z",
        durationMs: 60_000,
        note: "superseded record",
      });
      yield* work.upsertManualEntry({
        id: original.id,
        trackingProjectId: first.id,
        occurredAt: original.occurredAt,
        durationMs: 120_000,
        note: "current record",
      });
      yield* work.upsertManualEntry({
        trackingProjectId: second.id,
        occurredAt: "2026-09-01T21:30:00.000Z",
        durationMs: 180_000,
      });
      yield* sql`INSERT INTO work_records(id, kind, tracking_project_id, cross_repository, occurred_at, elapsed_ms, task_ms, outcome, coverage, revision, created_at, updated_at) VALUES ('turn', 'agent-turn', ${first.id}, 0, '2026-09-01T22:40:00.000Z', 240000, NULL, 'succeeded', 'complete', 0, '2026-09-01T22:40:00.000Z', '2026-09-01T22:40:00.000Z'), ('task', 'agent-task', ${first.id}, 0, '2026-09-01T22:45:00.000Z', NULL, 360000, 'succeeded', 'complete', 0, '2026-09-01T22:45:00.000Z', '2026-09-01T22:45:00.000Z')`;
      const range = { since: "2026-09-01T00:00:00.000Z", until: "2026-09-03T00:00:00.000Z" };
      const overview = yield* work.overview(range);
      assert.deepEqual(overview.dailyTotals, [
        {
          date: "2026-09-01",
          trackingProjectId: second.id,
          developerMs: 180_000,
          agentElapsedMs: 0,
          taskMs: 0,
        },
        {
          date: "2026-09-02",
          trackingProjectId: first.id,
          developerMs: 120_000,
          agentElapsedMs: 240_000,
          taskMs: 360_000,
        },
      ]);
      const filtered = yield* work.overview({ ...range, trackingProjectId: first.id });
    assert.deepEqual(filtered.dailyTotals, overview.dailyTotals?.slice(1));
      const csv = yield* work.exportCsv(undefined, "2026-09");
      assert.equal(csv.content.split("\n").length, 5);
      assert.ok(csv.content.startsWith("project_name,record_id,"));
      assert.include(csv.content, '"First project"');
      assert.include(csv.content, '"Second project"');
      assert.include(csv.content, '"current record"');
      assert.notInclude(csv.content, "superseded record");
      const projectCsv = yield* work.exportCsv(first.id, "2026-09");
      assert.equal(projectCsv.content.split("\n").length, 4);
      assert.notInclude(projectCsv.content, '"Second project"');
    }).pipe(Effect.provide(makeTestLayer())),
);

it.effect("keeps token and tool-use totals with immutable report membership", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 54 });
    const work = yield* WorkTrackingService;
    yield* work.upsertProfile({ displayName: "Developer", timeZone: "UTC", trackingEnabled: true });
    const project = yield* work.upsertProject({
      name: "Ledger",
      t3ProjectIds: [ProjectId.make("t3-project")],
      trackingEnabled: true,
    });
    yield* work.recordAutomatic({
      kind: "agent-turn",
      projectId: "t3-project",
      threadId: "thread",
      turnId: "turn",
      sourceEventId: "event-analytics",
      occurredAt: "2026-09-01T12:00:00.000Z",
      provider: "codex",
      outcome: "succeeded",
      coverage: "complete",
      inputTokens: 10,
      cachedInputTokens: 4,
      outputTokens: 6,
      reasoningTokens: 2,
      elapsedMs: 60,
      taskMs: null,
      model: null,
      effort: null,
      toolUses: 3,
    });
    const report = yield* work.createReport({ trackingProjectId: project.id, month: "2026-09" });
    const snapshot = yield* work.getReportSnapshot({ id: report.id });
    assert.deepEqual(snapshot.totals, {
      manualMs: 0,
      agentElapsedMs: 60,
      agentActiveMs: 0,
      agentWaitingMs: 0,
      agentTaskMs: 0,
      inputTokens: 10,
      cachedInputTokens: 4,
      outputTokens: 6,
      reasoningTokens: 2,
      toolUses: 3,
      records: 1,
    });
  }).pipe(Effect.provide(makeTestLayer())),
);

it.effect("returns every manual entry in a month beyond the overview page cap", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 54 });
    const work = yield* WorkTrackingService;
    const project = yield* work.upsertProject({
      name: "Ledger",
      t3ProjectIds: [],
      trackingEnabled: true,
    });
    yield* Effect.forEach(Array.from({ length: 501 }), () =>
      work.upsertManualEntry({
        trackingProjectId: project.id,
        occurredAt: "2026-09-01T12:00:00.000Z",
        durationMs: 60,
      }),
    );
    const input = {
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
    };

    assert.equal((yield* work.overview(input)).records.length, 500);
    assert.equal((yield* work.manualRecords(input)).length, 501);
  }).pipe(Effect.provide(makeTestLayer())),
);

it.effect("rejects ambiguous T3 project bindings before replacing bindings", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 54 });
    const work = yield* WorkTrackingService;
    const first = yield* work.upsertProject({
      name: "First",
      t3ProjectIds: [ProjectId.make("t3-a"), ProjectId.make("t3-b")],
      trackingEnabled: true,
    });
    const second = yield* work.upsertProject({
      name: "Second",
      t3ProjectIds: [ProjectId.make("t3-c")],
      trackingEnabled: true,
    });
    const conflict = yield* Effect.flip(
      work.upsertProject({
        id: second.id,
        name: "Second",
        t3ProjectIds: [ProjectId.make("t3-a")],
        trackingEnabled: true,
      }),
    );
    assert.equal(conflict.message, "A T3 project is already bound to another tracking project.");
    const saved = yield* work.upsertProject({
      id: first.id,
      name: "First",
      t3ProjectIds: [ProjectId.make("t3-a"), ProjectId.make("t3-b")],
      trackingEnabled: true,
    });
    assert.deepEqual(saved.t3ProjectIds, [ProjectId.make("t3-a"), ProjectId.make("t3-b")]);
  }).pipe(Effect.provide(makeTestLayer())),
);

it.effect("rejects stale manual correction ids and cross-repository single bindings", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 54 });
    const work = yield* WorkTrackingService;
    const sql = yield* SqlClient.SqlClient;
    const project = yield* work.upsertProject({
      name: "Ledger",
      t3ProjectIds: [ProjectId.make("t3-a")],
      trackingEnabled: true,
    });
    const other = yield* work.upsertProject({
      name: "Other",
      t3ProjectIds: [ProjectId.make("t3-b")],
      trackingEnabled: true,
    });
    yield* sql`INSERT INTO projection_threads(thread_id, project_id, title, model_selection_json, created_at, updated_at) VALUES ('thread-a', 't3-a', 'Bound', '{}', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'), ('thread-b', 't3-b', 'Other', '{}', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`;
    yield* sql`INSERT INTO work_repositories(id, tracking_project_id, local_root, canonical_identity, inclusion, provenance, created_at, updated_at) VALUES ('included', ${project.id}, '/included', NULL, 'included', 'manual', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'), ('excluded', ${project.id}, '/excluded', NULL, 'excluded', 'manual', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'), ('other-repository', ${other.id}, '/other', NULL, 'included', 'manual', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`;
    const original = yield* work.upsertManualEntry({
      trackingProjectId: project.id,
      occurredAt: "2026-09-01T12:00:00.000Z",
      durationMs: 60,
    });
    const correction = yield* work.upsertManualEntry({
      id: original.id,
      trackingProjectId: project.id,
      occurredAt: "2026-09-01T12:00:00.000Z",
      durationMs: 120,
    });
    const crossProjectCorrection = yield* Effect.flip(
      work.upsertManualEntry({
        id: correction.id,
        trackingProjectId: other.id,
        occurredAt: "2026-09-01T12:00:00.000Z",
        durationMs: 180,
      }),
    );
    assert.equal(
      crossProjectCorrection.message,
      "Manual entry belongs to another tracking project.",
    );
    const stale = yield* Effect.flip(
      work.upsertManualEntry({
        id: original.id,
        trackingProjectId: project.id,
        occurredAt: "2026-09-01T12:00:00.000Z",
        durationMs: 180,
      }),
    );
    assert.equal(stale.message, "Manual entry is not a current record.");
    const invalid = yield* Effect.flip(
      work.upsertManualEntry({
        id: correction.id,
        trackingProjectId: project.id,
        occurredAt: "2026-09-01T12:00:00.000Z",
        durationMs: 180,
        repositoryId: "repository" as never,
        crossRepository: true,
      }),
    );
    assert.equal(invalid.message, "Cross-repository entries cannot select one repository.");
    const excludedRepository = yield* Effect.flip(
      work.upsertManualEntry({
        trackingProjectId: project.id,
        occurredAt: "2026-09-01T12:00:00.000Z",
        durationMs: 180,
        repositoryId: "excluded" as never,
      }),
    );
    assert.equal(
      excludedRepository.message,
      "Repository must be included in this tracking project.",
    );
    const otherRepository = yield* Effect.flip(
      work.upsertManualEntry({
        trackingProjectId: project.id,
        occurredAt: "2026-09-01T12:00:00.000Z",
        durationMs: 180,
        repositoryId: "other-repository" as never,
      }),
    );
    assert.equal(otherRepository.message, "Repository must be included in this tracking project.");
    const otherThread = yield* Effect.flip(
      work.upsertManualEntry({
        trackingProjectId: project.id,
        occurredAt: "2026-09-01T12:00:00.000Z",
        durationMs: 180,
        threadId: "thread-b" as never,
      }),
    );
    assert.equal(otherThread.message, "Thread is not bound to this tracking project.");
    const valid = yield* work.upsertManualEntry({
      trackingProjectId: project.id,
      occurredAt: "2026-09-01T12:00:00.000Z",
      durationMs: 180,
      threadId: "thread-a" as never,
      repositoryId: "included" as never,
    });
    assert.equal(valid.threadId, "thread-a");
    assert.equal(valid.repositoryId, "included");
  }).pipe(Effect.provide(makeTestLayer())),
);

it.effect("keeps snapshot membership immutable across corrections and report transitions", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 54 });
    const work = yield* WorkTrackingService;
    const sql = yield* SqlClient.SqlClient;
    yield* work.upsertProfile({ displayName: "Developer", timeZone: "UTC", trackingEnabled: true });
    const project = yield* work.upsertProject({
      name: "Ledger",
      t3ProjectIds: [ProjectId.make("t3-project")],
      trackingEnabled: true,
    });
    const original = yield* work.upsertManualEntry({
      trackingProjectId: project.id,
      occurredAt: "2026-09-01T12:00:00.000Z",
      durationMs: 600,
      note: "original",
    });
    const report = yield* work.createReport({ trackingProjectId: project.id, month: "2026-09" });
    assert.deepEqual(report.recordIds, [original.id]);

    const late = yield* work.upsertManualEntry({
      trackingProjectId: project.id,
      occurredAt: "2026-09-02T12:00:00.000Z",
      durationMs: 300,
    });
    const corrected = yield* work.upsertManualEntry({
      id: original.id,
      trackingProjectId: project.id,
      occurredAt: "2026-09-01T12:00:00.000Z",
      durationMs: 900,
      note: "corrected",
    });
    const revisions = yield* sql<{
      readonly id: string;
      readonly revision: number;
      readonly supersedesId: string | null;
    }>`SELECT id, revision, supersedes_id AS "supersedesId" FROM work_records ORDER BY revision`;
    assert.deepEqual(revisions, [
      { id: original.id, revision: 0, supersedesId: corrected.id },
      { id: late.id, revision: 0, supersedesId: null },
      { id: corrected.id, revision: 1, supersedesId: null },
    ]);

    const submitted = yield* work.transitionReport({ id: report.id, status: "submitted" });
    assert.equal(submitted.status, "submitted");
    const withdrawn = yield* work.transitionReport({ id: report.id, status: "open" });
    assert.equal(withdrawn.status, "open");
    yield* work.transitionReport({ id: report.id, status: "submitted" });
    const invoiced = yield* work.transitionReport({ id: report.id, status: "invoiced" });
    assert.equal(invoiced.status, "invoiced");
    const immutable = yield* Effect.flip(work.transitionReport({ id: report.id, status: "open" }));
    assert.equal(immutable.message, "Invoiced reports are immutable.");

    const overview = yield* work.overview({
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(overview.totals.manualMs, 1200);
    assert.equal(overview.projectTotals[0]?.totals.manualMs, 1200);
    assert.deepEqual(
      overview.adjustments.map((record) => record.id),
      [original.id],
    );
    assert.deepEqual(overview.reports[0]?.recordIds, [original.id]);
    assert.ok(!overview.reports[0]?.recordIds.includes(late.id));
    assert.ok(!overview.reports[0]?.recordIds.includes(corrected.id));
    const snapshot = yield* work.getReportSnapshot({ id: report.id });
    assert.deepEqual(
      snapshot.records.map((record) => record.id),
      [original.id],
    );
    assert.equal(snapshot.records[0]?.durationMs, 600);
    assert.equal(snapshot.totals.manualMs, 600);
    yield* work.upsertProject({
      id: project.id,
      name: "Renamed ledger",
      t3ProjectIds: [ProjectId.make("t3-project")],
      trackingEnabled: true,
    });
    yield* work.upsertProfile({
      displayName: "Renamed developer",
      timeZone: "UTC",
      trackingEnabled: true,
    });
    const frozenSnapshot = yield* work.getReportSnapshot({ id: report.id });
    assert.equal(frozenSnapshot.projectName, "Ledger");
    assert.equal(frozenSnapshot.profileDisplayName, "Developer");
    const snapshotCsv = yield* work.exportReportCsv({ id: report.id });
    assert.include(snapshotCsv.content, "Ledger");
    assert.include(snapshotCsv.content, "Developer");
    assert.notInclude(snapshotCsv.content, "Renamed ledger");
    assert.notInclude(snapshotCsv.content, "Renamed developer");
    assert.include(snapshotCsv.content, "original");
    assert.notInclude(snapshotCsv.content, "corrected");
  }).pipe(Effect.provide(testLayer)),
);

it.effect("preserves delivered history when reopening a delivery cycle", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 54 });
    const work = yield* WorkTrackingService;
    const sql = yield* SqlClient.SqlClient;
    const project = yield* work.upsertProject({
      name: "Ledger",
      t3ProjectIds: [ProjectId.make("t3-project")],
      trackingEnabled: true,
    });
    yield* work.upsertProject({
      name: "Other",
      t3ProjectIds: [ProjectId.make("t3-other")],
      trackingEnabled: true,
    });
    yield* sql`INSERT INTO projection_threads(thread_id, project_id, title, model_selection_json, created_at, updated_at) VALUES ('thread-project', 't3-project', 'Bound', '{}', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'), ('thread-other', 't3-other', 'Other', '{}', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`;
    const invalidThread = yield* Effect.flip(work.markDelivery(project.id, "thread-other"));
    assert.equal(invalidThread.message, "Thread is not bound to this tracking project.");
    const delivered = yield* work.markDelivery(project.id, "thread-project");
    const reopened = yield* work.reopenDelivery(delivered.id);
    assert.notEqual(reopened.id, delivered.id);
    assert.equal(reopened.status, "open");
    const duplicateReopen = yield* Effect.flip(work.reopenDelivery(delivered.id));
    assert.equal(duplicateReopen.message, "An open delivery cycle already exists.");
    const redelivered = yield* work.markDelivery(project.id, "thread-project");
    assert.equal(redelivered.id, reopened.id);
    assert.equal(redelivered.status, "delivered");
    const overview = yield* work.overview({
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(overview.deliveries.filter((item) => item.status === "delivered").length, 2);
    assert.ok(overview.deliveries.some((item) => item.id === delivered.id));
  }).pipe(Effect.provide(makeTestLayer())),
);

it.effect("transitions reports outside the overview report limit", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 54 });
    const sql = yield* SqlClient.SqlClient;
    const work = yield* WorkTrackingService;
    const project = yield* work.upsertProject({
      name: "Ledger",
      t3ProjectIds: [],
      trackingEnabled: true,
    });
    for (const index of Array.from({ length: 101 }, (_, index) => index))
      yield* sql`INSERT INTO work_reports(id, tracking_project_id, month, status, generated_at, status_at, revision, reference) VALUES (${`report-${index}`}, ${project.id}, '2026-09', 'open', ${`2026-09-01T00:00:${String(index).padStart(2, "0")}.000Z`}, '2026-09-01T00:00:00.000Z', 0, NULL)`;
    const transitioned = yield* work.transitionReport({
      id: "report-0" as never,
      status: "submitted",
    });
    assert.equal(transitioned.status, "submitted");
  }).pipe(Effect.provide(makeTestLayer())),
);

it.effect("round-trips versioned backups with repeatable merge imports", () =>
  Effect.gen(function* () {
    const backup = yield* Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 54 });
      const work = yield* WorkTrackingService;
      yield* work.upsertProfile({
        displayName: "Developer",
        timeZone: "UTC",
        trackingEnabled: true,
      });
      const project = yield* work.upsertProject({
        name: "Ledger",
        t3ProjectIds: [ProjectId.make("t3-project")],
        trackingEnabled: true,
      });
      const record = yield* work.upsertManualEntry({
        trackingProjectId: project.id,
        occurredAt: "2026-09-01T12:00:00.000Z",
        durationMs: 600,
      });
      const report = yield* work.createReport({ trackingProjectId: project.id, month: "2026-09" });
      yield* work.markDelivery(project.id, null);
      yield* work.transitionReport({ id: report.id, status: "submitted" });
      yield* work.transitionReport({ id: report.id, status: "invoiced" });
      const exported = yield* work.exportJson;
      assert.deepEqual(exported.reports[0]?.recordIds, [record.id]);
      assert.equal(exported.reports[0]?.status, "invoiced");
      return exported;
    }).pipe(Effect.provide(makeTestLayer()));
    const imported = yield* Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 54 });
      const work = yield* WorkTrackingService;
      const empty = yield* work.exportJson;
      assert.deepEqual(yield* work.importJson({ mode: "merge", backup: empty }), empty);
      const duplicateRecords = { ...backup, records: [...backup.records, backup.records[0]!] };
      const duplicateRecordError = yield* Effect.flip(
        work.importJson({ mode: "merge", backup: duplicateRecords }),
      );
      assert.equal(duplicateRecordError.message, "Backup has duplicate records.");
      const firstProject = backup.projects[0]!;
      const firstRecord = backup.records[0]!;
      const selfRevision = {
        ...backup,
        records: [{ ...firstRecord, supersedesId: firstRecord.id }],
      };
      const selfRevisionError = yield* Effect.flip(
        work.importJson({ mode: "merge", backup: selfRevision }),
      );
      assert.equal(selfRevisionError.message, "Record cannot supersede itself.");
      const cycleRecord = {
        ...firstRecord,
        id: "cycle-record" as never,
        sourceEventId: null,
        supersedesId: firstRecord.id,
      };
      const cycle = {
        ...backup,
        records: [{ ...firstRecord, supersedesId: cycleRecord.id }, cycleRecord],
      };
      const cycleError = yield* Effect.flip(work.importJson({ mode: "merge", backup: cycle }));
      assert.equal(cycleError.message, "Record revisions contain a cycle.");
      const otherProject = {
        ...firstProject,
        id: "revision-project" as never,
        name: "Revision project",
        t3ProjectIds: [],
        repositories: [],
      };
      const crossProjectRevision = {
        ...backup,
        projects: [firstProject, otherProject],
        records: [
          { ...firstRecord, supersedesId: "revision-record" as never },
          {
            ...firstRecord,
            id: "revision-record" as never,
            sourceEventId: null,
            trackingProjectId: otherProject.id,
            supersedesId: null,
          },
        ],
      };
      const crossProjectRevisionError = yield* Effect.flip(
        work.importJson({ mode: "merge", backup: crossProjectRevision }),
      );
      assert.equal(crossProjectRevisionError.message, "Record revision crosses tracking projects.");
      const repository = {
        id: "repository" as never,
        trackingProjectId: firstProject.id,
        localRoot: "/repository",
        canonicalIdentity: null,
        inclusion: "included" as const,
        provenance: "manual" as const,
        createdAt: firstProject.createdAt,
        updatedAt: firstProject.updatedAt,
      };
      const duplicateRepositories = {
        ...backup,
        projects: [{ ...firstProject, repositories: [repository, repository] }],
      };
      const duplicateRepositoryError = yield* Effect.flip(
        work.importJson({ mode: "merge", backup: duplicateRepositories }),
      );
      assert.equal(duplicateRepositoryError.message, "Backup has duplicate repositories.");
      const crossProjectRepository = {
        ...backup,
        projects: [
          { ...firstProject, repositories: [] },
          {
            ...firstProject,
            id: "other-project" as never,
            name: "Other",
            t3ProjectIds: [],
            repositories: [
              {
                id: "other-repository" as never,
                trackingProjectId: "other-project" as never,
                localRoot: "/other-repository",
                canonicalIdentity: null,
                inclusion: "included" as const,
                provenance: "manual" as const,
                createdAt: firstProject.createdAt,
                updatedAt: firstProject.updatedAt,
              },
            ],
          },
        ],
        records: backup.records.map((record) => ({
          ...record,
          repositoryId: "other-repository" as never,
        })),
      };
      const repositoryError = yield* Effect.flip(
        work.importJson({ mode: "merge", backup: crossProjectRepository }),
      );
      assert.equal(
        repositoryError.message,
        "Record repository belongs to another tracking project.",
      );
      const crossProjectReport = {
        ...crossProjectRepository,
        records: backup.records,
        reports: backup.reports.map((report) => ({
          ...report,
          trackingProjectId: "other-project" as never,
        })),
      };
      const reportGraphError = yield* Effect.flip(
        work.importJson({ mode: "merge", backup: crossProjectReport }),
      );
      assert.equal(reportGraphError.message, "Report record belongs to another tracking project.");
      const first = yield* work.importJson({ mode: "merge", backup });
      const second = yield* work.importJson({ mode: "merge", backup });
      assert.deepEqual(first, backup);
      assert.deepEqual(second, backup);
      assert.equal(second.reports[0]?.status, "invoiced");
      assert.deepEqual(second.reports[0]?.recordIds, backup.reports[0]?.recordIds);
      const conflicting = {
        ...backup,
        records: backup.records.map((record) =>
          record.kind === "manual" ? { ...record, durationMs: 601 } : record,
        ),
      };
      const conflict = yield* Effect.flip(work.importJson({ mode: "merge", backup: conflicting }));
      assert.equal(conflict.message, "Backup record conflicts with local history.");
      const reportConflict = {
        ...backup,
        reports: backup.reports.map((report) => ({ ...report, recordIds: [] })),
      };
      const reportError = yield* Effect.flip(
        work.importJson({ mode: "merge", backup: reportConflict }),
      );
      assert.equal(reportError.message, "Backup report conflicts with local history.");
      const duplicateBinding = {
        ...backup,
        projects: [
          ...backup.projects,
          { ...backup.projects[0]!, id: "another-project" as never, repositories: [] },
        ],
      };
      const bindingError = yield* Effect.flip(
        work.importJson({ mode: "merge", backup: duplicateBinding }),
      );
      assert.equal(bindingError.message, "Backup binds a T3 project more than once.");
      assert.deepEqual(yield* work.exportJson, backup);
    }).pipe(Effect.provide(makeTestLayer()));
    return imported;
  }),
);

it.effect("rejects invalid backup references without partial writes", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 54 });
    const work = yield* WorkTrackingService;
    const invalid = {
      version: 1 as const,
      profile: null,
      projects: [],
      records: [
        {
          id: "record" as never,
          kind: "manual" as const,
          trackingProjectId: "missing" as never,
          projectId: null,
          threadId: null,
          turnId: null,
          repositoryId: null,
          crossRepository: false,
          occurredAt: "2026-09-01T12:00:00.000Z",
          durationMs: 1,
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
          outcome: "succeeded" as const,
          coverage: "complete" as const,
          category: null,
          note: null,
          sourceEventId: null,
          revision: 0,
          supersedesId: null,
          createdAt: "2026-09-01T12:00:00.000Z",
          updatedAt: "2026-09-01T12:00:00.000Z",
        },
      ],
      deliveries: [],
      reports: [],
    };
    const error = yield* Effect.flip(work.importJson({ mode: "merge", backup: invalid }));
    assert.equal(error.message, "Record references a missing tracking project.");
    const exported = yield* work.exportJson;
    assert.deepEqual(exported, {
      version: 1,
      profile: null,
      projects: [],
      records: [],
      deliveries: [],
      reports: [],
    });
  }).pipe(Effect.provide(testLayer)),
);

it.effect("exports records beyond the overview window limit", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 54 });
    const work = yield* WorkTrackingService;
    const project = yield* work.upsertProject({
      name: "Ledger",
      t3ProjectIds: [],
      trackingEnabled: true,
    });
    yield* Effect.forEach(
      Array.from({ length: 501 }, (_, index) => index),
      (index) =>
        work.upsertManualEntry({
          trackingProjectId: project.id,
          occurredAt: `2026-09-01T12:${String(index % 60).padStart(2, "0")}:00.000Z`,
          durationMs: 1,
        }),
    );
    assert.equal(
      (yield* work.overview({
        since: "2026-09-01T00:00:00.000Z",
        until: "2026-09-02T00:00:00.000Z",
      })).records.length,
      500,
    );
    assert.equal((yield* work.exportJson).records.length, 501);
  }).pipe(Effect.provide(makeTestLayer())),
);

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/** Environment-local ledger. Financial amounts deliberately have no column. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS work_profiles (
      id TEXT PRIMARY KEY, display_name TEXT NOT NULL, time_zone TEXT NOT NULL,
      tracking_enabled INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS work_tracking_projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, tracking_enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS work_tracking_project_bindings (
      tracking_project_id TEXT NOT NULL REFERENCES work_tracking_projects(id),
      project_id TEXT NOT NULL UNIQUE, PRIMARY KEY (tracking_project_id, project_id)
    ) WITHOUT ROWID
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS work_repositories (
      id TEXT PRIMARY KEY, tracking_project_id TEXT NOT NULL REFERENCES work_tracking_projects(id),
      local_root TEXT NOT NULL, canonical_identity TEXT, inclusion TEXT NOT NULL,
      provenance TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(tracking_project_id, local_root)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS work_records (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, tracking_project_id TEXT NOT NULL REFERENCES work_tracking_projects(id),
      project_id TEXT, thread_id TEXT, turn_id TEXT, repository_id TEXT REFERENCES work_repositories(id),
      cross_repository INTEGER NOT NULL, occurred_at TEXT NOT NULL, duration_ms INTEGER,
      elapsed_ms INTEGER, active_ms INTEGER, waiting_ms INTEGER, task_ms INTEGER,
      provider TEXT, model TEXT, effort TEXT, surface TEXT, input_tokens INTEGER,
      cached_input_tokens INTEGER, output_tokens INTEGER, reasoning_tokens INTEGER,
      tool_usage_json TEXT, outcome TEXT NOT NULL, coverage TEXT NOT NULL, category TEXT,
      note TEXT, source_event_id TEXT, revision INTEGER NOT NULL, supersedes_id TEXT REFERENCES work_records(id),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(source_event_id)
    )
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS work_records_project_window ON work_records(tracking_project_id, occurred_at)`;
  yield* sql`CREATE INDEX IF NOT EXISTS work_records_thread_window ON work_records(thread_id, occurred_at)`;
  yield* sql`CREATE INDEX IF NOT EXISTS work_records_repository_window ON work_records(repository_id, occurred_at)`;
  yield* sql`
    CREATE TABLE IF NOT EXISTS work_deliveries (
      id TEXT PRIMARY KEY, tracking_project_id TEXT NOT NULL REFERENCES work_tracking_projects(id),
      thread_id TEXT, status TEXT NOT NULL, delivered_at TEXT, reopened_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS work_reports (
      id TEXT PRIMARY KEY, tracking_project_id TEXT NOT NULL REFERENCES work_tracking_projects(id),
      month TEXT NOT NULL, status TEXT NOT NULL, generated_at TEXT NOT NULL,
      status_at TEXT NOT NULL, revision INTEGER NOT NULL, reference TEXT,
      project_name_snapshot TEXT, profile_display_name_snapshot TEXT
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS work_report_records (
      report_id TEXT NOT NULL REFERENCES work_reports(id), record_id TEXT NOT NULL REFERENCES work_records(id),
      PRIMARY KEY(report_id, record_id)
    ) WITHOUT ROWID
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS work_reports_project_month ON work_reports(tracking_project_id, month)`;
  yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS work_deliveries_one_open_cycle ON work_deliveries(tracking_project_id, COALESCE(thread_id, '')) WHERE status = 'open'`;
});

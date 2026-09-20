import type { WorkRecord } from "@t3tools/contracts";

const FORMULA_PREFIX = /^[=+\-@\t\r]/u;

/** Encodes user-controlled cells so spreadsheet imports cannot execute formulas. */
export function encodeCsvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  const safeText = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function encodeCsvRow(values: ReadonlyArray<string | number | boolean | null>): string {
  return values.map(encodeCsvCell).join(",");
}

export const WORK_RECORD_CSV_HEADER = [
  "record_id",
  "tracking_project_id",
  "project_id",
  "thread_id",
  "turn_id",
  "repository_id",
  "cross_repository",
  "occurred_at",
  "kind",
  "duration_ms",
  "elapsed_ms",
  "active_ms",
  "waiting_ms",
  "task_ms",
  "provider",
  "model",
  "effort",
  "surface",
  "input_tokens",
  "cached_input_tokens",
  "output_tokens",
  "reasoning_tokens",
  "tool_usage",
  "outcome",
  "coverage",
  "category",
  "note",
  "source_event_id",
  "revision",
  "supersedes_id",
  "created_at",
  "updated_at",
] as const;

export function workRecordCsvValues(
  record: WorkRecord,
): ReadonlyArray<string | number | boolean | null> {
  return [
    record.id,
    record.trackingProjectId,
    record.projectId,
    record.threadId,
    record.turnId,
    record.repositoryId,
    record.crossRepository,
    record.occurredAt,
    record.kind,
    record.durationMs,
    record.elapsedMs,
    record.activeMs,
    record.waitingMs,
    record.taskMs,
    record.provider,
    record.model,
    record.effort,
    record.surface,
    record.tokens.inputTokens,
    record.tokens.cachedInputTokens,
    record.tokens.outputTokens,
    record.tokens.reasoningTokens,
    record.toolUsage === null ? null : JSON.stringify(record.toolUsage),
    record.outcome,
    record.coverage,
    record.category,
    record.note,
    record.sourceEventId,
    record.revision,
    record.supersedesId,
    record.createdAt,
    record.updatedAt,
  ];
}

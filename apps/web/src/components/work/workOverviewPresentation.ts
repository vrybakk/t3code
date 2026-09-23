import type { WorkRecord } from "@t3tools/contracts";

export function workOverviewDays(since: string, until: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const date = (instant: number) => {
    const parts = formatter.formatToParts(instant);
    return ["year", "month", "day"]
      .map((type) => parts.find((part) => part.type === type)?.value)
      .join("-");
  };
  const first = Date.parse(`${date(Date.parse(since))}T00:00:00Z`);
  const last = Date.parse(`${date(Date.parse(until) - 1)}T00:00:00Z`);
  return Array.from({ length: Math.round((last - first) / 86_400_000) + 1 }, (_, day) =>
    new Date(first + day * 86_400_000).toISOString().slice(0, 10),
  );
}

export function workRecordPresentation(record: WorkRecord) {
  if (record.kind === "manual")
    return {
      title: record.category ?? "Developer time",
      detail: record.note ?? (record.revision > 0 ? "Corrected entry" : "Manual entry"),
      duration: record.durationMs,
    };
  return {
    title: record.kind === "agent-turn" ? "Agent session" : "Agent task",
    detail: [record.provider, record.model, record.outcome].filter(Boolean).join(" · "),
    duration: record.kind === "agent-turn" ? record.elapsedMs : record.taskMs,
  };
}

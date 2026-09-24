export function taskDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime())
    ? "Not set"
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function taskDuration(value: number | null | undefined): string {
  if (value == null) return "Not set";
  if (value === 0) return "0m";
  const minutes = Math.round(value / 60_000);
  if (minutes === 0) return "<1m";
  const hours = Math.floor(minutes / 60);
  return [hours ? `${hours}h` : "", minutes % 60 ? `${minutes % 60}m` : ""]
    .filter(Boolean)
    .join(" ");
}

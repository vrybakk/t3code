// @effect-diagnostics globalDate:off -- Calendar boundaries use Intl in the reporting timezone.
export type WorkWindowKind = "today" | "week" | "month";

interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const formatterFor = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

const partsAt = (instant: Date, timeZone: string) => {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
};

const addDays = (date: CivilDate, amount: number): CivilDate => {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + amount));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
};

const compareDate = (left: CivilDate, right: CivilDate) =>
  left.year - right.year || left.month - right.month || left.day - right.day;

/** Finds the first real instant in a civil date; some zones skip local midnight. */
const firstInstantOfCivilDate = (date: CivilDate, timeZone: string) => {
  const nominal = Date.UTC(date.year, date.month - 1, date.day);
  const start = nominal - 36 * 60 * 60 * 1_000;
  const end = nominal + 36 * 60 * 60 * 1_000;
  let low = start;
  let high = end;
  for (let instant = start; instant <= end; instant += 60 * 60 * 1_000) {
    const local = partsAt(new Date(instant), timeZone);
    if (compareDate(local, date) >= 0) {
      high = instant;
      low = instant - 60 * 60 * 1_000;
      break;
    }
  }
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    const local = partsAt(new Date(middle), timeZone);
    if (compareDate(local, date) >= 0) high = middle;
    else low = middle;
  }
  return new Date(high).toISOString();
};

export const isIanaTimeZone = (timeZone: string) => {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
};

/** Inclusive civil dates, converted to the same exclusive bounds used by Work queries. */
export function workDateRange(from: string, through: string, timeZone: string) {
  const parse = (value: string): CivilDate | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) return null;
    return { year, month, day };
  };
  const start = parse(from);
  const end = parse(through);
  if (!start || !end || compareDate(start, end) > 0) return null;
  return {
    since: firstInstantOfCivilDate(start, timeZone),
    until: firstInstantOfCivilDate(addDays(end, 1), timeZone),
  };
}

export const workTimeWindow = (kind: WorkWindowKind, timeZone: string, now: Date = new Date()) => {
  const today = partsAt(now, timeZone);
  const date = { year: today.year, month: today.month, day: today.day };
  const sinceDate =
    kind === "today"
      ? date
      : kind === "month"
        ? { ...date, day: 1 }
        : addDays(
            date,
            -((new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() + 6) % 7),
          );
  const untilDate =
    kind === "today"
      ? addDays(sinceDate, 1)
      : kind === "week"
        ? addDays(sinceDate, 7)
        : (() => {
            const next = new Date(Date.UTC(sinceDate.year, sinceDate.month, 1));
            return {
              year: next.getUTCFullYear(),
              month: next.getUTCMonth() + 1,
              day: 1,
            };
          })();
  return {
    since: firstInstantOfCivilDate(sinceDate, timeZone),
    until: firstInstantOfCivilDate(untilDate, timeZone),
  };
};

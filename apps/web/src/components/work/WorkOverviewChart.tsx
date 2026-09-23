import type { WorkOverview } from "@t3tools/contracts";
import { useState } from "react";

import { niceScale } from "../usage/UsageProviderChart";
import { formatWorkDuration, type WorkMonthlyMetric } from "./workMonthlySeries";

const WIDTH = 960;
const HEIGHT = 260;
const TOP = 8;

export function buildWorkOverviewSeries(
  days: ReadonlyArray<string>,
  totals: NonNullable<WorkOverview["dailyTotals"]>,
  metric: WorkMonthlyMetric,
) {
  const values = new Map<string, number>();
  for (const entry of totals) values.set(entry.date, (values.get(entry.date) ?? 0) + entry[metric]);
  return days.map((date) => ({ date, value: values.get(date) ?? 0 }));
}

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function WorkOverviewChart({
  days,
  dailyTotals,
  metric,
  label,
}: {
  readonly days: ReadonlyArray<string>;
  readonly dailyTotals: NonNullable<WorkOverview["dailyTotals"]>;
  readonly metric: WorkMonthlyMetric;
  readonly label: string;
}) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const series = buildWorkOverviewSeries(days, dailyTotals, metric);
  const peak = Math.max(0, ...series.map((entry) => entry.value));
  const unit = peak >= 3_600_000 ? 3_600_000 : 60_000;
  const durationScale = niceScale(peak / unit, 4);
  const scale = {
    max: durationScale.max * unit,
    ticks: durationScale.ticks.map((tick) => tick * unit),
  };
  const toY = (value: number) => HEIGHT - (value / (scale.max || 1)) * (HEIGHT - TOP);
  const toX = (index: number) =>
    days.length === 1 ? WIDTH / 2 : (index * WIDTH) / (days.length - 1);
  const line = series
    .map((entry, index) => `${index === 0 ? "M" : "L"}${toX(index)},${toY(entry.value)}`)
    .join(" ");
  const active = series.find((entry) => entry.date === activeDate);
  const axisIndices = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])].filter(
    (index) => index >= 0 && index < days.length,
  );
  return (
    <div className="min-w-0">
      <div className="flex gap-2">
        <div className="relative h-64 w-12 shrink-0" aria-hidden>
          {scale.ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
              style={{ top: `${(toY(tick) / HEIGHT) * 100}%` }}
            >
              {formatWorkDuration(tick)}
            </span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-64 min-w-0 flex-1 overflow-visible"
          role="group"
          aria-label={`Daily ${label.toLowerCase()}`}
          onPointerLeave={() => setActiveDate(null)}
        >
          {scale.ticks.map((tick) => (
            <line
              key={tick}
              x1={0}
              x2={WIDTH}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="currentColor"
              className="text-border"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {series.length > 1 && (
            <path
              d={`${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`}
              fill="currentColor"
              className="text-foreground/10"
            />
          )}
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            className="text-foreground"
          />
          {series.map((entry, index) => {
            const step = days.length > 1 ? WIDTH / (days.length - 1) : WIDTH;
            return (
              <g
                key={entry.date}
                tabIndex={0}
                role="img"
                aria-label={`${entry.date}: ${formatWorkDuration(entry.value)} ${label.toLowerCase()}`}
                className="outline-none focus-visible:[&>rect]:stroke-ring"
                onFocus={() => setActiveDate(entry.date)}
                onBlur={() => setActiveDate(null)}
                onPointerEnter={() => setActiveDate(entry.date)}
              >
                <rect
                  x={Math.max(0, toX(index) - step / 2)}
                  width={
                    days.length === 1
                      ? WIDTH
                      : index === 0 || index === days.length - 1
                        ? step / 2
                        : step
                  }
                  height={HEIGHT}
                  fill="transparent"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                {(days.length === 1 || activeDate === entry.date) && (
                  <circle
                    cx={toX(index)}
                    cy={toY(entry.value)}
                    r={4}
                    fill="currentColor"
                    className="text-foreground"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 pl-14" aria-hidden>
        <div className="relative h-4 text-[10px] text-muted-foreground uppercase">
          {axisIndices.map((index) => (
            <span
              key={index}
              className="absolute whitespace-nowrap"
              style={{
                left: `${(toX(index) / WIDTH) * 100}%`,
                transform: `translateX(${days.length === 1 ? -50 : index === 0 ? 0 : index === days.length - 1 ? -100 : -50}%)`,
              }}
            >
              {dateLabel(days[index]!)}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 min-h-4 text-xs text-muted-foreground" aria-live="polite">
        {active
          ? `${dateLabel(active.date)} · ${formatWorkDuration(active.value)} ${label.toLowerCase()}`
          : peak > 0
            ? "Hover or focus a day to see its total."
            : `No ${label.toLowerCase()} recorded in this period.`}
      </p>
    </div>
  );
}

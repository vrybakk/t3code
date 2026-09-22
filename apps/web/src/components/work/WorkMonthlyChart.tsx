import type { WorkTrackingProject } from "@t3tools/contracts";
import { useState } from "react";

import { niceScale } from "../usage/UsageProviderChart";
import { formatWorkDuration, workProjectColor, type WorkDayColumn } from "./workMonthlySeries";

const WIDTH = 960;
const HEIGHT = 220;
const TOP = 8;

export function WorkMonthlyChart({
  days,
  projects,
  metricLabel,
}: {
  readonly days: ReadonlyArray<WorkDayColumn>;
  readonly projects: ReadonlyArray<WorkTrackingProject>;
  readonly metricLabel: string;
}) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const peak = Math.max(0, ...days.map((day) => day.total));
  const scale = niceScale(peak, 4);
  const toY = (value: number) => HEIGHT - (value / (scale.max || 1)) * (HEIGHT - TOP);
  const step = WIDTH / days.length;
  const active = days.find((day) => day.date === activeDate);
  return (
    <div className="mt-5">
      <div className="flex gap-2">
        <div className="relative h-56 w-12 shrink-0" aria-hidden>
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
          className="h-56 min-w-0 flex-1 overflow-visible"
          role="group"
          aria-label={`Daily ${metricLabel.toLowerCase()} by project`}
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
          {days.map((day, index) => {
            let stacked = 0;
            return (
              <g
                key={day.date}
                tabIndex={0}
                role="img"
                aria-label={`${day.date}: ${formatWorkDuration(day.total)} ${metricLabel.toLowerCase()}`}
                className="outline-none focus-visible:[&>rect:first-child]:stroke-ring"
                onFocus={() => setActiveDate(day.date)}
                onBlur={() => setActiveDate(null)}
                onPointerEnter={() => setActiveDate(day.date)}
              >
                <rect
                  x={index * step + 1}
                  width={step - 2}
                  y={0}
                  height={HEIGHT}
                  fill="currentColor"
                  className={activeDate === day.date ? "text-accent/70" : "text-transparent"}
                  strokeWidth={2}
                />
                {day.segments.map((segment) => {
                  stacked += segment.value;
                  return (
                    <rect
                      key={segment.projectId}
                      x={index * step + step * 0.18}
                      width={step * 0.64}
                      y={toY(stacked)}
                      height={(segment.value / (scale.max || 1)) * (HEIGHT - TOP)}
                      fill={workProjectColor(
                        projects.findIndex((project) => project.id === segment.projectId),
                      )}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 pl-14 text-[10px] text-muted-foreground" aria-hidden>
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {[1, 8, 15, 22, days.length].map((day) => (
            <span key={day} className="text-center" style={{ gridColumn: day }}>
              {day}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 min-h-10 text-xs text-muted-foreground" aria-live="polite">
        {active ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-medium text-foreground">
              {active.date} · {formatWorkDuration(active.total)}
            </span>
            {active.segments.map((segment) => (
              <span key={segment.projectId}>
                {projects.find((project) => project.id === segment.projectId)?.name}:{" "}
                {formatWorkDuration(segment.value)}
              </span>
            ))}
          </div>
        ) : peak > 0 ? (
          "Hover or focus a day to see its project breakdown."
        ) : (
          `No ${metricLabel.toLowerCase()} recorded in this month.`
        )}
      </div>
    </div>
  );
}

import type { GitButlerDiscoveryItem } from "@t3tools/contracts";
import type { ReactNode } from "react";
import * as Option from "effect/Option";
import { GitBranchIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";

export function GitButlerDiscoveryRow({
  item,
  enabled,
  control,
  environmentOnly = false,
}: {
  readonly item: GitButlerDiscoveryItem;
  readonly enabled: boolean;
  readonly control: ReactNode;
  readonly environmentOnly?: boolean;
}) {
  const version = Option.getOrNull(item.version);
  const detail = Option.getOrNull(item.detail);
  const isAvailable = item.status === "available";
  const badge =
    item.status === "incompatible"
      ? "Update required"
      : item.status === "error"
        ? "Check failed"
        : item.status === "missing"
          ? "Not installed"
          : null;
  const summary =
    item.status === "available"
      ? enabled
        ? "Available on this server. Open GitButler from a project thread to inspect a configured workspace."
        : "Installed on this server. GitButler integration is turned off."
      : item.status === "missing"
        ? item.installHint
        : (detail ?? `GitButler ${item.minimumVersion} or newer is required.`);

  return (
    <div className="rounded-xl px-3 py-3 transition-colors hover:bg-muted/20 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
              <GitBranchIcon className="size-4.5 text-foreground/80" aria-hidden />
              <span
                className={cn(
                  "pointer-events-none absolute -left-0.5 -top-0.5 size-2 rounded-full ring-2 ring-background",
                  isAvailable ? "bg-success" : "bg-warning",
                )}
                aria-hidden
              />
            </span>
            <span className="truncate text-sm font-medium text-foreground">{item.label}</span>
            {version ? <code className="text-xs text-muted-foreground">{version}</code> : null}
            {badge ? (
              <Badge variant="warning" size="sm">
                {badge}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm leading-snug text-muted-foreground/80">{summary}</p>
          {environmentOnly ? (
            <p className="text-xs text-muted-foreground">
              Change this setting for the environment.
            </p>
          ) : null}
        </div>
        {control}
      </div>
    </div>
  );
}

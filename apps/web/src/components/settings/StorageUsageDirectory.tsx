import type { StorageUsageResult } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { formatStorageBytes } from "./StorageUsage.logic";
import { StorageUsageList } from "./StorageUsageList";

export function StorageUsageDirectory({
  directory,
  search,
  offset,
  loading,
  onPage,
  onOpen,
}: {
  directory: NonNullable<StorageUsageResult["directory"]>;
  search: string;
  offset: number;
  loading: boolean;
  onPage: (search: string, offset: number) => void;
  onOpen: (directoryId?: string) => void;
}) {
  return (
    <div className="space-y-4">
      <nav aria-label="Storage folders" className="flex flex-wrap items-center gap-1 text-xs">
        <Button
          size="xs"
          variant="ghost"
          disabled={loading || directory.current === null}
          onClick={() => onOpen()}
        >
          Scanned locations
        </Button>
        {directory.breadcrumbs.map((entry) => (
          <span key={entry.id} className="flex min-w-0 items-center gap-1">
            <span aria-hidden="true">/</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="xs"
                    variant="ghost"
                    className="max-w-48 truncate"
                    disabled={loading || entry.id === directory.current?.id}
                    onClick={() => onOpen(entry.id)}
                  />
                }
              >
                {entry.name}
              </TooltipTrigger>
              <TooltipPopup className="max-w-sm break-all">{entry.path}</TooltipPopup>
            </Tooltip>
          </span>
        ))}
      </nav>
      <StorageUsageList
        title="Folders and files"
        description="Browse the cached scan. Opening folders never reads file contents or starts another scan."
        search={search}
        offset={offset}
        count={directory.totalEntries}
        shown={directory.entries.length}
        loading={loading}
        onPage={onPage}
      >
        <ul
          className="divide-y divide-border/60"
          aria-label="Scanned folders and files"
          aria-busy={loading}
        >
          {directory.entries.map((entry) => {
            const unmeasured =
              entry.kind === "unmeasured" ||
              entry.status === "skipped" ||
              entry.status === "shared";
            return (
              <li
                key={entry.id}
                className="flex min-w-0 items-start justify-between gap-3 rounded-md px-3 py-3 hover:bg-muted/30"
              >
                <div className="min-w-0 space-y-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        entry.kind === "directory" && entry.status !== "skipped" ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            className="h-auto max-w-full justify-start whitespace-normal px-0 text-left"
                            disabled={loading}
                            onClick={() => onOpen(entry.id)}
                          />
                        ) : (
                          <span tabIndex={0} className="block truncate text-sm" />
                        )
                      }
                    >
                      {entry.name}
                      {entry.kind === "directory" ? "/" : ""}
                    </TooltipTrigger>
                    <TooltipPopup className="max-w-sm break-all">{entry.path}</TooltipPopup>
                  </Tooltip>
                  <p className="text-xs text-muted-foreground">
                    {entry.kind === "directory"
                      ? `${entry.fileCount.toLocaleString()} measured files`
                      : entry.kind === "symlink"
                        ? "Symbolic link · not followed"
                        : "File"}
                    {entry.status === "shared"
                      ? " · counted elsewhere"
                      : entry.status === "skipped" || entry.kind === "unmeasured"
                        ? " · not measured"
                        : entry.status === "partial"
                          ? " · partial measurement"
                          : ""}
                  </p>
                </div>
                <div className="shrink-0 space-y-1 text-right tabular-nums">
                  <p className="text-sm">
                    {unmeasured
                      ? "Not measured here"
                      : `${formatStorageBytes(entry.logicalBytes)}${entry.status === "partial" ? " measured" : ""}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {unmeasured ? "" : `${formatStorageBytes(entry.allocatedBytes)} on disk`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {directory.entries.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            {search ? "No entries match this search." : "No entries in this scanned folder."}
          </p>
        )}
      </StorageUsageList>
    </div>
  );
}

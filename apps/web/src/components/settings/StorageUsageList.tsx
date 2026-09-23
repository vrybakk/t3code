import { useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { STORAGE_HISTORY_PAGE_SIZE } from "./StorageUsage.logic";

export function StorageUsageList({
  title,
  description,
  search,
  offset,
  count,
  shown,
  loading,
  onPage,
  children,
}: {
  title: string;
  description: string;
  search: string;
  offset: number;
  count: number;
  shown: number;
  loading: boolean;
  onPage: (search: string, offset: number) => void;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState(search);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <form
          className="flex w-full items-center gap-2 sm:w-auto"
          onSubmit={(event) => {
            event.preventDefault();
            onPage(draft.trim(), 0);
          }}
        >
          <Input
            size="compact"
            type="search"
            aria-label={`Search ${title.toLowerCase()}`}
            placeholder="Search…"
            value={draft}
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button size="xs" variant="outline" type="submit" disabled={loading}>
            Search
          </Button>
        </form>
      </div>
      {children}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {count === 0 ? "0" : `${offset + 1}–${Math.min(offset + shown, count)}`} of{" "}
          {count.toLocaleString()}
          {search ? " matches" : " items"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={loading || offset === 0}
            onClick={() => onPage(search, Math.max(0, offset - STORAGE_HISTORY_PAGE_SIZE))}
          >
            Previous
          </Button>
          <span>
            Page {Math.floor(offset / STORAGE_HISTORY_PAGE_SIZE) + 1} of{" "}
            {Math.max(1, Math.ceil(count / STORAGE_HISTORY_PAGE_SIZE))}
          </span>
          <Button
            size="xs"
            variant="outline"
            disabled={loading || offset + STORAGE_HISTORY_PAGE_SIZE >= count}
            onClick={() => onPage(search, offset + STORAGE_HISTORY_PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

import { Button } from "../ui/button";

export const WORK_PAGE_SIZE = 25;

export function WorkPagination({
  page,
  total,
  pending = false,
  onPageChange,
}: {
  readonly page: number;
  readonly total: number;
  readonly pending?: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / WORK_PAGE_SIZE));
  return (
    <nav
      aria-label="Breakdown pages"
      className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-muted-foreground"
    >
      <span className="tabular-nums">
        {total
          ? `${Math.min(page * WORK_PAGE_SIZE + 1, total)}–${Math.min((page + 1) * WORK_PAGE_SIZE, total)} of ${total.toLocaleString()}`
          : "0 records"}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending || page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="tabular-nums">
          Page {page + 1} of {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={pending || page + 1 >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

import { useAtomValue } from "@effect/atom-react";
import type { ClickUpSprint, EnvironmentId } from "@t3tools/contracts";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  CalendarRangeIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  RefreshCwIcon,
} from "lucide-react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { taskDate } from "./taskFormatting";

export function ClickUpTaskWorkspace({
  environmentId,
  workspaceId,
  userId,
}: {
  environmentId: EnvironmentId;
  workspaceId: string;
  userId: number;
}) {
  const search = useSearch({ from: "/tasks" });
  const query = serverEnvironment.clickUpSprints({ environmentId, input: { workspaceId, userId } });
  const result = useAtomValue(query);
  const data = Option.getOrNull(AsyncResult.value(result));
  const sprintId = search.sprintId ?? data?.activeSprintId;
  const selected = data?.sprints.find((sprint) => sprint.id === sprintId);
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside
        aria-label="Sprints"
        className="shrink-0 border-b border-border bg-muted/20 p-3 md:w-64 md:border-r md:border-b-0"
      >
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CalendarRangeIcon className="size-4" /> Sprints
          </h2>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Refresh sprints"
            disabled={result.waiting}
            onClick={() => appAtomRegistry.refresh(query)}
          >
            <RefreshCwIcon className="size-3.5" />
          </Button>
        </div>
        {AsyncResult.isFailure(result) ? (
          <p role="alert" className="px-2 py-3 text-xs text-destructive">
            Could not load company sprints. Check your workspace and access, then refresh.
          </p>
        ) : !data ? (
          <p role="status" className="px-2 py-3 text-xs text-muted-foreground">
            Loading sprints…
          </p>
        ) : (
          <nav aria-label="Sprint selection" className="space-y-1">
            {data.sprints.map((sprint) => {
              const Icon =
                sprint.state === "active"
                  ? CircleDotIcon
                  : sprint.state === "past"
                    ? CircleCheckIcon
                    : CircleDashedIcon;
              return (
                <Link
                  key={sprint.id}
                  to="/tasks"
                  search={{ environmentId, workspaceId, sprintId: sprint.id }}
                  aria-current={sprint.id === selected?.id ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors hover:bg-accent ${sprint.id === selected?.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground"}`}
                  title={sprint.name}
                >
                  <Icon
                    className={`size-3.5 shrink-0 ${sprint.state === "active" ? "text-primary" : sprint.state === "past" ? "text-success" : ""}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{sprint.name}</span>
                  {sprint.taskCount !== null && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {sprint.taskCount}
                    </span>
                  )}
                </Link>
              );
            })}
            {!data.sprints.length && (
              <p className="px-2 py-3 text-xs text-muted-foreground">No sprints available.</p>
            )}
          </nav>
        )}
      </aside>
      {selected ? (
        <SprintTasks
          key={selected.id}
          environmentId={environmentId}
          workspaceId={workspaceId}
          userId={userId}
          sprint={selected}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          {!data
            ? "Your sprint tasks will appear here."
            : search.sprintId
              ? "This sprint is outside the current window. Select a sprint from the sidebar."
              : "No active sprint right now. Select a sprint from the sidebar."}
        </div>
      )}
    </div>
  );
}

function SprintTasks({
  environmentId,
  workspaceId,
  userId,
  sprint,
}: {
  environmentId: EnvironmentId;
  workspaceId: string;
  userId: number;
  sprint: ClickUpSprint;
}) {
  const search = useSearch({ from: "/tasks" });
  const navigate = useNavigate({ from: "/tasks" });
  const page = search.page ?? 0;
  const query = serverEnvironment.clickUpTasks({
    environmentId,
    input: { workspaceId, page, userId, listId: sprint.id },
  });
  const result = useAtomValue(query);
  const data = Option.getOrNull(AsyncResult.value(result));
  const setPage = (page: number) =>
    void navigate({ search: { environmentId, workspaceId, sprintId: sprint.id, page } });
  return (
    <section aria-label="Sprint tasks" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium">{sprint.name}</h2>
            {sprint.state === "active" && <Badge variant="info">Active</Badge>}
            {sprint.state === "upcoming" && <Badge variant="secondary">Upcoming</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {taskDate(sprint.startDate)} – {taskDate(sprint.dueDate)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={result.waiting}
          onClick={() => appAtomRegistry.refresh(query)}
          aria-label="Refresh tasks"
        >
          <RefreshCwIcon className="size-4" /> Refresh
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {AsyncResult.isFailure(result) ? (
          <p role="alert" className="p-5 text-sm text-destructive">
            Could not load sprint tasks. Refresh to try again.
          </p>
        ) : !data ? (
          <p role="status" className="p-5 text-sm text-muted-foreground">
            Loading tasks…
          </p>
        ) : data.tasks.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No tasks on this sprint page.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5">Project list</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tasks.map((task) => (
                <TableRow key={task.taskId}>
                  <TableCell className="min-w-64 whitespace-normal pl-5 py-3">
                    <Link
                      to="/tasks"
                      search={{
                        environmentId,
                        workspaceId,
                        sprintId: sprint.id,
                        page,
                        taskId: task.taskId,
                      }}
                      className="flex items-start gap-3 text-sm font-medium hover:text-primary"
                    >
                      <CircleIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span>{task.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{task.status}</Badge>
                  </TableCell>
                  <TableCell
                    className="max-w-56 truncate pr-5 text-muted-foreground"
                    title={task.listName}
                  >
                    {task.listName}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
      {data?.hasMore || page > 0 ? (
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-5 py-3">
          <span className="mr-auto text-xs text-muted-foreground">Page {page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0 || result.waiting}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!data?.hasMore || result.waiting || AsyncResult.isFailure(result)}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </section>
  );
}

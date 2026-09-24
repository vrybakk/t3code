import { useAtomValue } from "@effect/atom-react";
import type { ClickUpSprint, EnvironmentId } from "@t3tools/contracts";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { CircleIcon, RefreshCwIcon } from "lucide-react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { taskDate } from "./taskFormatting";

import { ClickUpStatusPicker, ClickUpTagsPicker } from "./ClickUpTaskEditors";

export function SprintTasks({
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
  const showAll = search.showAll === true;
  const query = serverEnvironment.clickUpTasks({
    environmentId,
    input: { workspaceId, page, userId, listId: sprint.id, showAll },
  });
  const result = useAtomValue(query);
  const data = Option.getOrNull(AsyncResult.value(result));
  const setPage = (page: number) =>
    void navigate({ search: { environmentId, workspaceId, sprintId: sprint.id, page, showAll } });
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {showAll ? "All tasks" : "Assigned to me"}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void navigate({
                search: { environmentId, workspaceId, sprintId: sprint.id, showAll: !showAll },
              })
            }
          >
            {showAll ? "Show mine" : "Show all"}
          </Button>
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
          <p className="p-5 text-sm text-muted-foreground">
            {showAll
              ? "No tasks on this sprint page."
              : "No tasks assigned to you on this sprint page. Use Show all to see the team’s tasks."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tags</TableHead>
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
                        showAll,
                        taskId: task.taskId,
                      }}
                      className="flex items-start gap-3 text-sm font-medium hover:text-primary"
                    >
                      <CircleIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span>{task.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ClickUpStatusPicker
                      environmentId={environmentId}
                      input={{ workspaceId, userId, taskId: task.taskId }}
                      taskName={task.name}
                      status={task.status}
                      color={task.statusColor}
                    />
                  </TableCell>
                  <TableCell className="max-w-72 whitespace-normal">
                    <ClickUpTagsPicker
                      environmentId={environmentId}
                      input={{ workspaceId, userId, taskId: task.taskId }}
                      taskName={task.name}
                      tags={task.tags ?? []}
                    />
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

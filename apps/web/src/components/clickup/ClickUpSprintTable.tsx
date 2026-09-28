import type { ClickUpTask, EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { TagIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { useThreadShells } from "../../state/entities";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Table, TableBody, TableCell, TableRow } from "../ui/table";
import { ClickUpStatusIconPicker } from "./ClickUpTaskEditors";
import { ClickUpProjectBadge } from "./ClickUpProjectBadge";
import { ClickUpTaskActionButtons, ClickUpTaskActionDialog } from "./ClickUpTaskActions";
import type { ClickUpTaskAction } from "./taskPrompt";
import { ClickUpSprintTaskActions } from "./ClickUpSprintTaskActions";

export function ClickUpSprintTable({
  environmentId,
  workspaceId,
  userId,
  sprintId,
  showAll,
  groups,
}: {
  environmentId: EnvironmentId;
  workspaceId: string;
  userId: number;
  sprintId: string;
  showAll: boolean;
  groups: ReadonlyArray<{ label: string | null; tasks: ReadonlyArray<ClickUpTask> }>;
}) {
  const threads = useThreadShells();
  const runningThreadIds = new Set(
    threads
      .filter(
        (thread) =>
          thread.environmentId === environmentId &&
          thread.archivedAt === null &&
          resolveSidebarThreadStatus(thread) === "working",
      )
      .map((thread) => thread.id),
  );
  const [selection, setSelection] = useState<{
    task: ClickUpTask;
    action: ClickUpTaskAction;
  } | null>(null);
  return (
    <>
      <Table className="min-w-2xl table-fixed">
        <colgroup>
          <col className="w-12" />
          <col className="w-36" />
          <col />
          <col className="w-32" />
        </colgroup>
        <TableBody>
          {groups
            .filter((group) => group.tasks.length > 0)
            .map((group) => (
              <Fragment key={group.label ?? "working"}>
                {group.label && (
                  <tr>
                    <td colSpan={4} className="p-0 pt-2">
                      <div className="flex items-center gap-3 border-y border-border bg-muted px-5 py-2">
                        <span className="text-xs font-semibold">{group.label}</span>
                        <Badge variant="outline">
                          <span className="tabular-nums">{group.tasks.length}</span>
                        </Badge>
                      </div>
                    </td>
                  </tr>
                )}
                {group.tasks.map((task) => (
                  <TableRow key={task.taskId}>
                    <TableCell compact>
                      <div className="ml-2">
                        <ClickUpStatusIconPicker
                          environmentId={environmentId}
                          input={{ workspaceId, userId, taskId: task.taskId }}
                          taskName={task.name}
                          taskType={task.taskType?.name ?? "Task"}
                          status={task.status}
                          color={task.statusColor}
                        />
                      </div>
                    </TableCell>
                    <TableCell compact className="max-w-56">
                      <div className="truncate text-muted-foreground">
                        <ClickUpProjectBadge task={task} />
                      </div>
                    </TableCell>
                    <TableCell compact className="min-w-64 max-w-lg whitespace-normal">
                      <div className="flex min-w-0 items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Link
                                to="/tasks"
                                search={{
                                  environmentId,
                                  workspaceId,
                                  sprintId,
                                  showAll,
                                  taskId: task.taskId,
                                }}
                                className="min-w-0 truncate text-xs font-medium hover:text-primary"
                              />
                            }
                          >
                            {task.name}
                          </TooltipTrigger>
                          <TooltipPopup className="max-w-96 whitespace-normal break-words text-left">
                            {task.name}
                          </TooltipPopup>
                        </Tooltip>
                        {!!task.tags?.length && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="flex max-w-1/2 shrink-0 items-center gap-1" />
                              }
                            >
                              <Badge variant="outline" size="sm" className="min-w-0 shrink">
                                <TagIcon className="size-3" />
                                <span className="min-w-0 max-w-28 truncate">{task.tags[0]}</span>
                              </Badge>
                              {task.tags.length > 1 && (
                                <Badge variant="secondary" size="sm">
                                  +{task.tags.length - 1}
                                </Badge>
                              )}
                            </TooltipTrigger>
                            <TooltipPopup>{task.tags.join(", ")}</TooltipPopup>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell compact>
                      <div className="mr-3">
                        {runningThreadIds.size > 0 ? (
                          <ClickUpSprintTaskActions
                            environmentId={environmentId}
                            workspaceId={workspaceId}
                            userId={userId}
                            task={task}
                            runningThreadIds={runningThreadIds}
                            onSelect={(action) => setSelection({ task, action })}
                          />
                        ) : (
                          <ClickUpTaskActionButtons
                            compact
                            task={task}
                            onSelect={(action) => setSelection({ task, action })}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
        </TableBody>
      </Table>
      {selection && (
        <ClickUpTaskActionDialog
          environmentId={environmentId}
          input={{ workspaceId, userId, taskId: selection.task.taskId }}
          taskName={selection.task.name}
          action={selection.action}
          onClose={() => setSelection(null)}
        />
      )}
    </>
  );
}

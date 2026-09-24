import type { ClickUpTask, EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { FlagIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { ClickUpStatusPicker } from "./ClickUpTaskEditors";
import { taskPriorityRank } from "./sprintTaskGroups";
import { ClickUpProjectBadge } from "./ClickUpProjectBadge";
import { ClickUpTaskActionButtons, ClickUpTaskActionDialog } from "./ClickUpTaskActions";
import type { ClickUpTaskAction } from "./taskPrompt";
import { ClickUpTaskTypeIcon } from "./ClickUpTaskTypeIcon";

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
  const [selection, setSelection] = useState<{
    task: ClickUpTask;
    action: ClickUpTaskAction;
  } | null>(null);
  return (
    <>
      <Table className="min-w-2xl table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="ml-3">Task</span>
            </TableHead>
            <TableHead className="w-24">Priority</TableHead>
            <TableHead className="w-40">Status</TableHead>
            <TableHead className="w-36">Project</TableHead>
            <TableHead className="w-32 text-right">
              <span className="mr-3">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups
            .filter((group) => group.tasks.length > 0)
            .map((group) => (
              <Fragment key={group.label ?? "working"}>
                {group.label && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="pt-2">
                        <div className="flex items-center gap-3 border-y border-border bg-muted px-5 py-3">
                          <span className="text-sm font-semibold">{group.label}</span>
                          <Badge variant="outline">
                            <span className="tabular-nums">{group.tasks.length}</span>
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {group.tasks.map((task) => (
                  <TableRow key={task.taskId}>
                    <TableCell className="min-w-64 max-w-lg whitespace-normal">
                      <div className="ml-3 py-1">
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
                                className="flex min-w-0 items-start gap-3 text-sm font-medium hover:text-primary"
                              />
                            }
                          >
                            <ClickUpTaskTypeIcon
                              name={task.taskType?.name ?? "Task"}
                              className="mt-0.5"
                            />
                            <span className="min-w-0 truncate">{task.name}</span>
                          </TooltipTrigger>
                          <TooltipPopup className="max-w-96 whitespace-normal break-words text-left">
                            {task.taskType?.name ?? "Task"}: {task.name}
                          </TooltipPopup>
                        </Tooltip>
                      </div>
                    </TableCell>
                    <TableCell>
                      <TaskPriority priority={task.priority} />
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
                    <TableCell className="max-w-56">
                      <div className="truncate text-muted-foreground">
                        <ClickUpProjectBadge task={task} />
                        {task.sources?.some((source) => source.kind === "project") && (
                          <Tooltip>
                            <TooltipTrigger
                              render={<span className="mt-1 block truncate text-xs" />}
                            >
                              {task.listName}
                            </TooltipTrigger>
                            <TooltipPopup>{task.listName}</TooltipPopup>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="mr-3">
                        <ClickUpTaskActionButtons
                          compact
                          task={task}
                          onSelect={(action) => setSelection({ task, action })}
                        />
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

function TaskPriority({ priority }: { priority: string | null | undefined }) {
  const rank = taskPriorityRank(priority);
  const label = ["Urgent", "High", "Normal", "Low", "No priority"][rank];
  const variant = rank === 0 ? "error" : rank === 1 ? "warning" : rank === 2 ? "info" : "secondary";
  return (
    <Badge variant={variant}>
      <FlagIcon className="size-3" />
      {label}
    </Badge>
  );
}

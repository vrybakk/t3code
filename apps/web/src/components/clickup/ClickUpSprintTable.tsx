import type { ClickUpTask, EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { CircleIcon, FlagIcon } from "lucide-react";
import { Fragment } from "react";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { ClickUpStatusPicker, ClickUpTagsPicker } from "./ClickUpTaskEditors";
import { taskPriorityRank } from "./sprintTaskGroups";
import { ClickUpProjectBadge } from "./ClickUpProjectBadge";

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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-5">Task</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Tags</TableHead>
          <TableHead className="pr-5">Project</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups
          .filter((group) => group.tasks.length > 0)
          .map((group) => (
            <Fragment key={group.label ?? "working"}>
              {group.label && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0 pt-4">
                    <div className="flex items-center gap-3 border-y border-border bg-muted px-5 py-3">
                      <span className="text-sm font-semibold">{group.label}</span>
                      <Badge variant="outline" className="tabular-nums">
                        {group.tasks.length}
                      </Badge>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {group.tasks.map((task) => (
                <TableRow key={task.taskId}>
                  <TableCell className="min-w-64 max-w-lg whitespace-normal pl-5 py-3">
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
                        <CircleIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{task.name}</span>
                      </TooltipTrigger>
                      <TooltipPopup className="max-w-96 whitespace-normal break-words text-left">
                        {task.name}
                      </TooltipPopup>
                    </Tooltip>
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
                  <TableCell className="min-w-40 max-w-72 whitespace-normal">
                    <ClickUpTagsPicker
                      environmentId={environmentId}
                      input={{ workspaceId, userId, taskId: task.taskId }}
                      taskName={task.name}
                      tags={task.tags ?? []}
                    />
                  </TableCell>
                  <TableCell className="max-w-56 truncate pr-5 text-muted-foreground">
                    <ClickUpProjectBadge task={task} />
                    {task.sources?.some((source) => source.kind === "project") && (
                      <Tooltip>
                        <TooltipTrigger render={<span className="mt-1 block truncate text-xs" />}>
                          {task.listName}
                        </TooltipTrigger>
                        <TooltipPopup>{task.listName}</TooltipPopup>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </Fragment>
          ))}
      </TableBody>
    </Table>
  );
}

function TaskPriority({ priority }: { priority: string | null | undefined }) {
  const rank = taskPriorityRank(priority);
  const label = ["Urgent", "High", "Normal", "Low", "No priority"][rank];
  const variant = rank === 0 ? "error" : rank === 1 ? "warning" : rank === 2 ? "info" : "secondary";
  return (
    <Badge variant={variant} className="gap-1.5 px-2">
      <FlagIcon className="size-3" />
      {label}
    </Badge>
  );
}

import { useAtomValue } from "@effect/atom-react";
import type { ClickUpSprint, EnvironmentId } from "@t3tools/contracts";
import { useNavigate, useSearch } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { ChevronRightIcon, RefreshCwIcon } from "lucide-react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { ClickUpSprintTable } from "./ClickUpSprintTable";
import { groupSprintTasks } from "./sprintTaskGroups";
import { taskDate } from "./taskFormatting";

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
  const showAll = search.showAll === true;
  const query = serverEnvironment.clickUpTasks({
    environmentId,
    input: { workspaceId, page: 0, userId, listId: sprint.id, showAll },
  });
  const result = useAtomValue(query);
  const data = Option.getOrNull(AsyncResult.value(result));
  const groups = groupSprintTasks(data?.tasks ?? []);
  const tableProps = { environmentId, workspaceId, userId, sprintId: sprint.id, showAll };
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
              ? "No tasks in this sprint."
              : "No tasks assigned to you in this sprint. Use Show all to see the team’s tasks."}
          </p>
        ) : (
          <div className="pb-8">
            {groups.working.length + groups.review.length > 0 ? (
              <ClickUpSprintTable
                {...tableProps}
                groups={[...groups.days, { label: "Code Review", tasks: groups.review }]}
              />
            ) : (
              <p className="p-5 text-sm text-muted-foreground">
                All tasks are in QA Testing, Staging or In Production.
              </p>
            )}
            {groups.deliveryCount > 0 && (
              <div className="border-t border-border">
                <Collapsible key={showAll ? "all" : "mine"}>
                  <CollapsibleTrigger className="group flex w-full items-center gap-2 px-5 py-4 text-left text-sm font-medium hover:bg-muted/30">
                    <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-panel-open:rotate-90" />
                    <span>QA Testing, Staging &amp; In Production</span>
                    <Badge variant="secondary" className="ml-auto">
                      {groups.deliveryCount}
                    </Badge>
                  </CollapsibleTrigger>
                  <CollapsiblePanel>
                    <ClickUpSprintTable {...tableProps} groups={groups.delivery} />
                  </CollapsiblePanel>
                </Collapsible>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </section>
  );
}

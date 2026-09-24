import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { Link, useSearch } from "@tanstack/react-router";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  CalendarRangeIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  PanelLeftCloseIcon,
  PanelLeftIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useId } from "react";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SprintTasks } from "./ClickUpSprintTasks";

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
  const [sprintsOpen, setSprintsOpen] = useLocalStorage(
    "t3code:clickup-sprints-open",
    true,
    Schema.Boolean,
  );
  const sprintsContentId = useId();
  const query = serverEnvironment.clickUpSprints({ environmentId, input: { workspaceId, userId } });
  const result = useAtomValue(query);
  const data = Option.getOrNull(AsyncResult.value(result));
  const sprintId = search.sprintId ?? data?.activeSprintId;
  const selected = data?.sprints.find((sprint) => sprint.id === sprintId);
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside
        aria-label="Sprints"
        className={`shrink-0 border-b border-border bg-muted/20 md:border-r md:border-b-0 ${sprintsOpen ? "p-3 md:w-64" : "p-2 md:w-12"}`}
      >
        <div
          className={`flex items-center ${sprintsOpen ? "mb-2 justify-between px-2" : "justify-center"}`}
        >
          <h2
            className={`${sprintsOpen ? "flex" : "hidden"} items-center gap-2 text-xs font-medium text-muted-foreground`}
          >
            <CalendarRangeIcon className="size-4" /> Sprints
          </h2>
          <div className="flex items-center gap-1">
            {sprintsOpen && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Refresh sprints"
                disabled={result.waiting}
                onClick={() => appAtomRegistry.refresh(query)}
              >
                <RefreshCwIcon className="size-3.5" />
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={sprintsOpen ? "Hide sprints" : "Show sprints"}
                    aria-expanded={sprintsOpen}
                    aria-controls={sprintsContentId}
                    onClick={() => setSprintsOpen((open) => !open)}
                  />
                }
              >
                {sprintsOpen ? (
                  <PanelLeftCloseIcon className="size-4" />
                ) : (
                  <PanelLeftIcon className="size-4" />
                )}
              </TooltipTrigger>
              <TooltipPopup>{sprintsOpen ? "Hide sprints" : "Show sprints"}</TooltipPopup>
            </Tooltip>
          </div>
        </div>
        <div id={sprintsContentId} hidden={!sprintsOpen}>
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
                    search={{
                      environmentId,
                      workspaceId,
                      sprintId: sprint.id,
                      showAll: search.showAll === true,
                    }}
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
        </div>
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

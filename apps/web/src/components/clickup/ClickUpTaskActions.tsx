import { useAtomValue } from "@effect/atom-react";
import type {
  ClickUpTask,
  ClickUpTaskInput,
  EnvironmentId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { CalculatorIcon, EyeIcon, ListChecksIcon, PlayIcon } from "lucide-react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "../ui/dialog";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ClickUpBackgroundAction } from "./ClickUpBackgroundAction";
import { ClickUpTaskLauncher } from "./ClickUpTaskLauncher";
import type { ClickUpTaskAction } from "./taskPrompt";

const actions = {
  requirements: {
    label: "Check requirements",
    icon: ListChecksIcon,
    description:
      "Review requirements without implementation. Post only actionable findings to the task.",
  },
  estimate: {
    label: "Estimate task",
    icon: CalculatorIcon,
    description:
      "Estimate AI-assisted implementation and verification using your default text-generation model.",
  },
  implement: {
    label: "Start task",
    icon: PlayIcon,
    description:
      "Research, implement, verify and review the task using your project instructions and studio skills.",
  },
} satisfies Record<
  ClickUpTaskAction,
  { label: string; icon: typeof PlayIcon; description: string }
>;

export function ClickUpTaskActionButtons({
  task,
  compact = false,
  runningThread,
  onSelect,
}: {
  task: Pick<ClickUpTask, "name" | "timeEstimate" | "tags">;
  compact?: boolean;
  runningThread?: ScopedThreadRef | undefined;
  onSelect: (action: ClickUpTaskAction) => void;
}) {
  return (
    <div
      className={
        compact
          ? "ml-auto flex w-max items-center gap-1"
          : "flex flex-wrap items-center justify-end gap-2"
      }
      aria-label={`Actions for ${task.name}`}
    >
      {(Object.keys(actions) as ClickUpTaskAction[]).map((action) => {
        if (action === "estimate" && task.timeEstimate != null) return null;
        if (action === "implement" && runningThread) {
          return (
            <Tooltip key={action}>
              <TooltipTrigger
                render={
                  <Button
                    size={compact ? "icon-sm" : "default"}
                    variant="outline"
                    aria-label={`See running thread: ${task.name}`}
                    render={<Link to="/$environmentId/$threadId" params={runningThread} />}
                  />
                }
              >
                <EyeIcon className="size-3.5" />
                {!compact && "See"}
              </TooltipTrigger>
              <TooltipPopup>See running thread</TooltipPopup>
            </Tooltip>
          );
        }
        const blocked =
          action === "implement" &&
          task.tags?.some((tag) => tag.trim().toLowerCase() === "no agent");
        const { label, icon: Icon } = actions[action];
        return (
          <Tooltip key={action}>
            <TooltipTrigger
              render={
                <Button
                  size={compact ? "icon-sm" : "default"}
                  variant={
                    compact
                      ? action === "implement"
                        ? "outline"
                        : "ghost"
                      : action === "implement"
                        ? "default"
                        : "outline"
                  }
                  aria-label={`${label}: ${task.name}`}
                  aria-disabled={blocked || undefined}
                  onClick={() => {
                    if (!blocked) onSelect(action);
                  }}
                />
              }
            >
              <Icon className="size-3.5" />
              {!compact && label}
            </TooltipTrigger>
            <TooltipPopup>
              {blocked ? "Remove the no agent tag to allow implementation." : label}
            </TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function ClickUpTaskActionDialog({
  environmentId,
  input,
  action,
  taskName,
  onClose,
}: {
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
  action: ClickUpTaskAction;
  taskName: string;
  onClose: () => void;
}) {
  const query = serverEnvironment.clickUpTask({ environmentId, input });
  const result = useAtomValue(query);
  const details = Option.getOrNull(AsyncResult.value(result));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup>
        {action !== "implement" ? (
          <ClickUpBackgroundAction
            key={`${environmentId}:${input.userId}:${input.workspaceId}:${input.taskId}:${action}`}
            environmentId={environmentId}
            input={{ ...input, action }}
            taskName={taskName}
            listName={details?.task.listName}
            onClose={onClose}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{actions[action].label}</DialogTitle>
              <DialogDescription>{actions[action].description}</DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <p className="text-sm font-medium">{taskName}</p>
              {AsyncResult.isFailure(result) ? (
                <div className="space-y-2">
                  <p role="alert" className="text-sm text-destructive">
                    Could not load task context.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={result.waiting}
                    onClick={() => appAtomRegistry.refresh(query)}
                  >
                    Retry
                  </Button>
                </div>
              ) : !details ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading task context…
                </p>
              ) : (
                <ClickUpTaskLauncher environmentId={environmentId} details={details} />
              )}
            </DialogPanel>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}

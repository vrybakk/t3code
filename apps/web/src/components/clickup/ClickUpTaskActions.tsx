import { useAtomValue } from "@effect/atom-react";
import type { ClickUpTask, ClickUpTaskInput, EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { CalculatorIcon, ListChecksIcon, PlayIcon } from "lucide-react";
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
      "Research the time to reach a review-ready result with AI and save the estimate. No implementation or comments.",
  },
  implement: {
    label: "Implement",
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
  onSelect,
}: {
  task: Pick<ClickUpTask, "name" | "timeEstimate" | "tags">;
  compact?: boolean;
  onSelect: (action: ClickUpTaskAction) => void;
}) {
  return (
    <div
      className={compact ? "flex w-max items-center gap-1" : "flex flex-wrap items-center gap-1"}
      aria-label={`Actions for ${task.name}`}
    >
      {(Object.keys(actions) as ClickUpTaskAction[]).map((action) => {
        if (action === "estimate" && task.timeEstimate != null) return null;
        const blocked =
          action === "implement" &&
          task.tags?.some((tag) => tag.trim().toLowerCase() === "no agent");
        const { label, icon: Icon } = actions[action];
        return (
          <Tooltip key={action}>
            <TooltipTrigger
              render={
                <Button
                  size={compact ? "icon-sm" : "sm"}
                  variant={action === "implement" ? "outline" : "ghost"}
                  aria-label={`${label}: ${task.name}`}
                  aria-disabled={blocked || undefined}
                  className={blocked ? "cursor-not-allowed opacity-50" : undefined}
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
        <DialogHeader>
          <DialogTitle>{actions[action].label}</DialogTitle>
          <DialogDescription>{actions[action].description}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
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
            <ClickUpTaskLauncher environmentId={environmentId} details={details} action={action} />
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

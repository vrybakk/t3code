import { useAtomValue } from "@effect/atom-react";
import type { ClickUpTaskInput, EnvironmentId } from "@t3tools/contracts";
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
      "Review the task and code, identify missing requirements, and prepare questions. No implementation or ClickUp changes.",
  },
  estimate: {
    label: "Estimate task",
    icon: CalculatorIcon,
    description:
      "Research the time to reach a review-ready result with AI. Save the estimate if estimation is needed; otherwise propose it in the thread.",
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
  taskName,
  compact = false,
  onSelect,
}: {
  taskName: string;
  compact?: boolean;
  onSelect: (action: ClickUpTaskAction) => void;
}) {
  return (
    <div
      className={compact ? "flex w-max items-center gap-1" : "flex flex-wrap items-center gap-1"}
      aria-label={`Actions for ${taskName}`}
    >
      {(Object.keys(actions) as ClickUpTaskAction[]).map((action) => {
        const { label, icon: Icon } = actions[action];
        return (
          <Tooltip key={action}>
            <TooltipTrigger
              render={
                <Button
                  size={compact ? "icon-sm" : "sm"}
                  variant={action === "implement" ? "outline" : "ghost"}
                  aria-label={`${label}: ${taskName}`}
                  onClick={() => onSelect(action)}
                />
              }
            >
              <Icon className="size-3.5" />
              {!compact && label}
            </TooltipTrigger>
            <TooltipPopup>{label}</TooltipPopup>
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

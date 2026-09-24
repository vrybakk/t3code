import { BookOpenIcon, BugIcon, CircleDashedIcon, MilestoneIcon, ShapesIcon } from "lucide-react";
import { cn } from "../../lib/utils";

const taskTypeIcons = {
  bug: BugIcon,
  task: CircleDashedIcon,
  "user story": BookOpenIcon,
  milestone: MilestoneIcon,
};

export function ClickUpTaskTypeIcon({ name, className }: { name: string; className?: string }) {
  const key = name.trim().toLowerCase();
  const Icon = Object.hasOwn(taskTypeIcons, key)
    ? taskTypeIcons[key as keyof typeof taskTypeIcons]
    : ShapesIcon;

  return (
    <Icon
      role="img"
      aria-label={name}
      className={cn("size-3.5 shrink-0 text-muted-foreground", className)}
    />
  );
}

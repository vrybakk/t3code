import type { ClickUpTask } from "@t3tools/contracts";
import { PROJECT_ICON_COLORS } from "../../projectIconColors";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function ClickUpProjectBadge({ task }: { task: ClickUpTask }) {
  const projects = task.sources?.filter((source) => source.kind === "project") ?? [];
  const labels = projects.length
    ? projects
    : [
        {
          id: task.sources?.find((s) => s.kind === "list")?.id ?? task.listName,
          name: task.listName,
          color: null,
        },
      ];
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((project) => {
        const color = project.color && /^#[\da-f]{6}$/i.test(project.color) ? project.color : null;
        const hash = [...project.id].reduce(
          (value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
          0,
        );
        const swatch = PROJECT_ICON_COLORS[hash % PROJECT_ICON_COLORS.length];
        return (
          <Tooltip key={project.id}>
            <TooltipTrigger
              render={
                <Badge
                  variant="outline"
                  className="max-w-full"
                  style={
                    color
                      ? {
                          backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                          borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
                        }
                      : undefined
                  }
                />
              }
            >
              <span
                className={`size-2 shrink-0 rounded-full ${color ? "" : swatch?.swatchClassName}`}
                style={color ? { backgroundColor: color } : undefined}
              />
              <span className="truncate">{project.name}</span>
            </TooltipTrigger>
            <TooltipPopup>
              {project.name} · {task.listName}
            </TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}

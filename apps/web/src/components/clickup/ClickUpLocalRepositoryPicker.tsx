import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { ProjectId } from "@t3tools/contracts";
import { useId, useState } from "react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";

export function ClickUpLocalRepositoryPicker({
  projects,
  selected,
  disabled,
  onSelectionChange,
}: {
  projects: ReadonlyArray<EnvironmentProject>;
  selected: ReadonlyArray<ProjectId>;
  disabled: boolean;
  onSelectionChange: (projectId: ProjectId, checked: boolean) => void;
}) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [showLinkedOnly, setShowLinkedOnly] = useState(false);
  const query = search.trim().toLocaleLowerCase();
  const visibleProjects = projects
    .filter(
      (project) =>
        (!showLinkedOnly || selected.includes(project.id)) &&
        (!query ||
          project.title.toLocaleLowerCase().includes(query) ||
          project.workspaceRoot.toLocaleLowerCase().includes(query)),
    )
    .sort((left, right) => left.title.localeCompare(right.title, undefined, { numeric: true }));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <label htmlFor={searchId} className="font-medium">
          Local repositories
        </label>
        <span className="text-xs text-muted-foreground">
          {selected.length} linked · {projects.length} available
        </span>
      </div>
      <Input
        id={searchId}
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search name or path"
        disabled={disabled}
      />
      {(selected.length > 0 || showLinkedOnly) && (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => setShowLinkedOnly((current) => !current)}
        >
          {showLinkedOnly ? "Show all repositories" : "Show linked only"}
        </Button>
      )}
      <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {visibleProjects.map((project) => (
          <label
            key={project.id}
            className="flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
          >
            <Checkbox
              aria-label={`${project.title} — ${project.workspaceRoot}`}
              checked={selected.includes(project.id)}
              disabled={disabled}
              onCheckedChange={(checked) => onSelectionChange(project.id, checked === true)}
            />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block truncate">{project.title}</span>
              <span className="block break-all text-xs text-muted-foreground">
                {project.workspaceRoot}
              </span>
            </span>
          </label>
        ))}
        {!visibleProjects.length && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {showLinkedOnly
              ? "No linked repositories match."
              : projects.length
                ? "No matching repositories."
                : "Add a local project to Nerd first."}
          </p>
        )}
      </div>
    </div>
  );
}

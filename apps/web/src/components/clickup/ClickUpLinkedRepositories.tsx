import type { ClickUpTask, EnvironmentId } from "@t3tools/contracts";
import { FolderGit2Icon } from "lucide-react";
import { ClickUpRepositoryClone } from "./ClickUpRepositoryClone";
import { ClickUpRepositoryMappings } from "./ClickUpRepositoryMappings";
import { useClickUpRepositories } from "./useClickUpRepositories";

export function ClickUpLinkedRepositories({
  task,
  environmentId,
}: {
  task: ClickUpTask;
  environmentId: EnvironmentId;
}) {
  const { mapping, mappedProjects, missing, unavailableLocalIds } = useClickUpRepositories(
    task,
    environmentId,
  );
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <span className="flex items-start gap-2 text-muted-foreground">
          <FolderGit2Icon className="mt-0.5 size-4" /> Repositories
        </span>
        <div className="min-w-0 space-y-2">
          {mappedProjects.map((project) => (
            <div key={project.id}>
              <span className="block">{project.title}</span>
              <span className="block break-all text-xs text-muted-foreground">
                {project.workspaceRoot}
              </span>
            </div>
          ))}
          {!mappedProjects.length && !missing.length && (
            <span className="text-muted-foreground">No linked repositories</span>
          )}
          {mapping && (
            <p className="text-xs text-muted-foreground">
              Saved for {mapping.sources.map((source) => source.name).join(", ")}
            </p>
          )}
          {unavailableLocalIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Some linked projects are unavailable. Update the links or finish their download.
            </p>
          )}
          {missing.map((repository) => (
            <ClickUpRepositoryClone
              key={repository.remoteUrl}
              repository={repository}
              task={task}
              environmentId={environmentId}
            />
          ))}
        </div>
      </div>
      <ClickUpRepositoryMappings task={task} environmentId={environmentId} />
    </div>
  );
}

import * as Schema from "effect/Schema";
import { ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const ClickUpLocalRepositoriesInput = Schema.Struct({
  projectIds: Schema.Array(ProjectId).check(Schema.isMaxLength(20)),
  remoteUrls: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(50)),
});
export const ClickUpLocalRepository = Schema.Struct({
  projectId: ProjectId,
  remoteUrl: TrimmedNonEmptyString,
  cwd: TrimmedNonEmptyString,
});
export type ClickUpLocalRepository = typeof ClickUpLocalRepository.Type;
export const ClickUpLocalRepositories = Schema.Array(ClickUpLocalRepository);

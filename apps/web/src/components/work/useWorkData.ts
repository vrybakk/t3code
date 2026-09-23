import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useMemo } from "react";

import { useProjects, useThreadShells } from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { browserTimeZone, workWindow } from "../../state/workTracking";
import { workProjectLabels } from "./workPresentation";

export function useWorkData(environmentId: EnvironmentId) {
  const browserZone = useMemo(() => browserTimeZone(), []);
  const bootstrapWindow = useMemo(() => workWindow("month", browserZone), [browserZone]);
  const bootstrap = useAtomValue(
    serverEnvironment.workOverview({
      environmentId,
      input: { ...bootstrapWindow, includeRecords: false },
    }),
  );
  const profile = Option.getOrNull(AsyncResult.value(bootstrap))?.profile;
  const timeZone = profile?.timeZone ?? browserZone;
  const monthWindow = useMemo(() => workWindow("month", timeZone), [timeZone]);
  const result = useAtomValue(
    serverEnvironment.workOverview({
      environmentId,
      input: { ...monthWindow, includeRecords: false },
    }),
  );
  const data = Option.getOrNull(AsyncResult.value(result));
  const sourceProjects = useProjects();
  const overview = useMemo(
    () =>
      data
        ? {
            ...data,
            projects: workProjectLabels(
              data.projects,
              sourceProjects.filter((project) => project.environmentId === environmentId),
            ),
          }
        : null,
    [data, sourceProjects, environmentId],
  );
  const threads = useThreadShells().filter((thread) => thread.environmentId === environmentId);
  return { overview, timeZone, threads, loading: result.waiting || bootstrap.waiting };
}

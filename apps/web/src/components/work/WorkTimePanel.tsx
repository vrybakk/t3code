import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, WorkRecord } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useMemo, type ComponentProps } from "react";

import { serverEnvironment } from "../../state/server";
import { workWindow } from "../../state/workTracking";
import { WorkManualEntries } from "./WorkManualEntries";

const inactiveRecords = Atom.make(AsyncResult.success<ReadonlyArray<WorkRecord>>([]));

export function WorkTimePanel({
  active,
  environmentId,
  timeZone,
  ...props
}: Omit<ComponentProps<typeof WorkManualEntries>, "records" | "monthLoading"> & {
  readonly active: boolean;
  readonly environmentId: EnvironmentId;
  readonly timeZone: string;
}) {
  const window = useMemo(
    () => workWindow("month", timeZone, new Date(`${props.month}-15T12:00:00.000Z`)),
    [props.month, timeZone],
  );
  const result = useAtomValue(
    active
      ? serverEnvironment.workManualRecords({ environmentId, input: window })
      : inactiveRecords,
  );
  return (
    <WorkManualEntries
      {...props}
      records={Option.getOrNull(AsyncResult.value(result)) ?? []}
      monthLoading={result.waiting}
    />
  );
}

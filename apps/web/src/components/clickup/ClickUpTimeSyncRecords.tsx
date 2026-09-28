import { useAtomValue } from "@effect/atom-react";
import type { ClickUpTimeRecord, EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useRef, useState } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { WorkSelect } from "../work/WorkSelect";
import { formatWorkDuration } from "../work/workMonthlySeries";

const taskKey = (task: { workspaceId: string; taskId: string }) =>
  `${task.workspaceId}/${task.taskId}`;
const defaultTask = (record: ClickUpTimeRecord) =>
  record.state === "pending" && record.tasks.length === 1 ? taskKey(record.tasks[0]!) : "";

export function ClickUpTimeSyncRecords({
  environmentId,
  threadId,
  userId,
  onBusyChange,
}: {
  environmentId: EnvironmentId;
  threadId?: ThreadId | undefined;
  userId: number;
  onBusyChange: (busy: boolean) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const query = serverEnvironment.clickUpTimePreview({
    environmentId,
    input: { userId, ...(threadId ? { threadId } : {}), offset },
  });
  const result = useAtomValue(query);
  const data = Option.getOrNull(AsyncResult.value(result));
  const sync = useAtomCommand(serverEnvironment.clickUpTimeSync, { reportFailure: false });
  useEffect(() => {
    appAtomRegistry.refresh(query);
  }, [query]);
  const selected = (data?.records ?? []).flatMap((record) => {
    if (record.state !== "pending") return [];
    const task = record.tasks.find(
      (task) => taskKey(task) === (allocations[record.recordId] ?? defaultTask(record)),
    );
    return task
      ? [
          {
            recordId: record.recordId,
            fingerprint: record.fingerprint,
            workspaceId: task.workspaceId,
            taskId: task.taskId,
          },
        ]
      : [];
  });
  const uncertain = (data?.records ?? []).flatMap((record) =>
    record.state === "uncertain" && record.destination
      ? [
          {
            recordId: record.recordId,
            fingerprint: record.fingerprint,
            workspaceId: record.destination.workspaceId,
            taskId: record.destination.taskId,
          },
        ]
      : [],
  );
  async function send(records: typeof selected) {
    if (sending.current || !records.length) return;
    sending.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      for (let start = 0; start < records.length; start += 20) {
        const response = await sync({
          environmentId,
          input: { userId, records: records.slice(start, start + 20) },
        });
        if (response._tag !== "Success") {
          setError(
            "Sync could not be confirmed. Refresh to check saved receipts before continuing.",
          );
          break;
        }
        setMessages((current) => ({
          ...current,
          ...Object.fromEntries(response.value.results.map((r) => [r.recordId, r.message])),
        }));
      }
    } catch {
      setError("Sync could not be confirmed. Refresh to check saved receipts before continuing.");
    } finally {
      appAtomRegistry.refresh(query);
      sending.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Recorded time</p>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || result.waiting}
          onClick={() => appAtomRegistry.refresh(query)}
        >
          Refresh
        </Button>
      </div>
      {AsyncResult.isFailure(result) && (
        <p role="alert" className="text-sm text-destructive">
          Could not load time records. Refresh to try again.
        </p>
      )}
      {!data && !AsyncResult.isFailure(result) && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading records…
        </p>
      )}
      {data && (
        <>
          {data.unlinkedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {data.unlinkedCount} records have no linked task. Attach a task to their thread first,
              or assign a thread when editing a manual entry in Work.
            </p>
          )}
          {!data.records.length && (
            <p className="text-sm text-muted-foreground">
              No linked time records yet. Refresh after the agent finishes its turn.
            </p>
          )}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {data.records.map((record) => (
              <div key={record.recordId} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="wrap-break-word">{record.threadTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.kind === "manual" ? "Manual work" : "Agent runtime"} ·{" "}
                      {new Date(record.start).toLocaleString()}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums">
                    {formatWorkDuration(record.duration)}
                  </span>
                </div>
                {record.state === "pending" ? (
                  <div className="space-y-1">
                    <label
                      htmlFor={`time-task-${record.recordId}`}
                      className="text-xs text-muted-foreground"
                    >
                      Destination task
                    </label>
                    <WorkSelect
                      id={`time-task-${record.recordId}`}
                      disabled={busy || result.waiting}
                      value={allocations[record.recordId] ?? defaultTask(record)}
                      onValueChange={(value) =>
                        setAllocations((current) => ({ ...current, [record.recordId]: value }))
                      }
                      options={[
                        {
                          value: "",
                          label: record.tasks.length
                            ? "Skip / choose a task"
                            : "No task in your connected workspaces",
                        },
                        ...record.tasks.map((task) => ({
                          value: taskKey(task),
                          label: task.name,
                          title: `${task.name} (${task.taskId})`,
                        })),
                      ]}
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {record.state === "synced"
                      ? `Synced to ${record.destination?.name}`
                      : record.state === "changed"
                        ? "Changed after export or exported under another account. Reconcile the existing entry in ClickUp."
                        : "Delivery unconfirmed. Check delivery below before making changes."}
                  </p>
                )}
                {messages[record.recordId] && (
                  <p role="status" className="text-xs text-muted-foreground">
                    {messages[record.recordId]}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={offset === 0 || busy || result.waiting}
              onClick={() => setOffset((value) => Math.max(0, value - 50))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {data.records.length ? `${offset + 1}–${offset + data.records.length}` : "0 records"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={!data.hasMore || busy || result.waiting}
              onClick={() => setOffset((value) => value + 50)}
            >
              Next
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!selected.length || busy || result.waiting || AsyncResult.isFailure(result)}
              onClick={() => void send(selected)}
            >
              {busy ? "Syncing…" : `Sync ${selected.length} selected`}
            </Button>
            {!!uncertain.length && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || result.waiting}
                onClick={() => void send(uncertain)}
              >
                Check delivery
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Each record goes to one task. Past entries are added without starting or stopping your
            ClickUp timer. Manual entries use their recorded date and time as the start.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

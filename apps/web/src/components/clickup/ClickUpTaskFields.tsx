import type { ClickUpTaskDetails, ClickUpTaskInput, EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import { Button } from "../ui/button";
import { ClickUpStatusPicker, ClickUpTagsPicker } from "./ClickUpTaskEditors";
import { taskDate, taskDuration } from "./taskFormatting";
import { ClickUpProjectBadge } from "./ClickUpProjectBadge";

export function ClickUpTaskFields({
  details,
  environmentId,
  input,
}: {
  details: ClickUpTaskDetails;
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
}) {
  const metadata = details.metadata;
  const fields: ReadonlyArray<readonly [string, React.ReactNode]> = [
    ["Project", <ClickUpProjectBadge key="project" task={details.task} />],
    [
      "Status",
      <ClickUpStatusPicker
        key="status"
        environmentId={environmentId}
        input={input}
        taskName={details.task.name}
        status={details.task.status}
        color={details.task.statusColor}
      />,
    ],
    ["Assignees", metadata?.assignees.map((user) => user.username).join(", ") || "Unassigned"],
    ["Start date", taskDate(metadata?.startDate)],
    ["Due date", taskDate(metadata?.dueDate)],
    ["Priority", metadata?.priority || "Not set"],
    ["Time estimate", taskDuration(metadata?.timeEstimate)],
    ["Time tracked", taskDuration(metadata?.timeSpent)],
    ["Created by", metadata?.creator?.username || "Not available"],
    ["Created", taskDate(metadata?.createdAt)],
    ["Updated", taskDate(metadata?.updatedAt)],
    ...(metadata?.closedAt ? [["Closed", taskDate(metadata.closedAt)] as const] : []),
    ...(metadata?.watchers.length
      ? [["Watchers", metadata.watchers.map((user) => user.username).join(", ")] as const]
      : []),
  ];
  return (
    <>
      <dl className="grid gap-x-8 gap-y-4 text-sm xl:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="grid min-w-0 grid-cols-[7rem_1fr] gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
        <div className="grid grid-cols-[7rem_1fr] gap-3 xl:col-span-2">
          <dt className="text-muted-foreground">Tags</dt>
          <dd className="flex flex-wrap gap-1.5">
            <ClickUpTagsPicker
              environmentId={environmentId}
              input={input}
              taskName={details.task.name}
              tags={metadata?.tags ?? []}
            />
          </dd>
        </div>
      </dl>
    </>
  );
}

export function ClickUpCustomFields({ details }: { details: ClickUpTaskDetails }) {
  const metadata = details.metadata;
  const [showEmpty, setShowEmpty] = useState(false);
  if (!metadata) return null;
  const emptyCount = metadata.customFields.filter(
    (field) => field.valueText === null || field.valueText === "",
  ).length;
  const fields = showEmpty
    ? metadata.customFields
    : metadata.customFields.filter((field) => field.valueText !== null && field.valueText !== "");
  return (
    <>
      {metadata && (
        <section className="space-y-3 border-t border-border pt-6" aria-label="Custom fields">
          <h3 className="text-sm font-medium">
            Custom fields{" "}
            <span className="ml-1 text-muted-foreground">{metadata.customFields.length}</span>
          </h3>
          {metadata.customFields.length ? (
            <dl className="divide-y divide-border">
              {fields.map((field) => (
                <div
                  key={field.id}
                  className="grid grid-cols-[minmax(7rem,1fr)_2fr] gap-4 py-3 text-sm"
                >
                  <dt className="break-words text-muted-foreground">{field.name}</dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {field.valueText ?? <span className="text-muted-foreground">Empty</span>}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No custom fields on this task.</p>
          )}
        </section>
      )}
      {emptyCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowEmpty(!showEmpty)}>
          {showEmpty ? "Hide" : "Show"} {emptyCount} empty fields
        </Button>
      )}
    </>
  );
}

import type { ClickUpTaskDetails, ClickUpTaskInput, EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

interface Props {
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
  checklists: NonNullable<ClickUpTaskDetails["metadata"]>["checklists"];
  refreshing: boolean;
}

export function ClickUpTaskChecklist({ environmentId, input, checklists, refreshing }: Props) {
  return checklists.map((checklist) => (
    <section
      key={checklist.id}
      className="space-y-3 border-t border-border pt-6"
      aria-label={checklist.name}
    >
      <h3 className="text-sm font-medium">
        {checklist.name}{" "}
        <span className="ml-1 text-xs text-muted-foreground">
          {checklist.items.filter((item) => item.resolved).length}/{checklist.items.length}
        </span>
      </h3>
      <ul className="space-y-3">
        {checklist.items.map((item) => (
          <ChecklistItem
            key={item.id}
            environmentId={environmentId}
            input={input}
            checklistId={checklist.id}
            item={item}
            refreshing={refreshing}
          />
        ))}
      </ul>
    </section>
  ));
}

function ChecklistItem({
  environmentId,
  input,
  checklistId,
  item,
  refreshing,
}: {
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
  checklistId: string;
  item: Props["checklists"][number]["items"][number];
  refreshing: boolean;
}) {
  const update = useAtomCommand(serverEnvironment.clickUpSetChecklistItemResolution);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const response = await update({
        environmentId,
        input: { ...input, checklistId, itemId: item.id, resolved: !item.resolved },
      });
      if (response._tag === "Success")
        appAtomRegistry.refresh(serverEnvironment.clickUpTask({ environmentId, input }));
      else
        setError(
          "Could not update this item. Refresh the task to check its state, then try again.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="space-y-1">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={item.resolved}
          disabled={busy || refreshing}
          onChange={() => void toggle()}
          className="mt-1"
        />
        <span className="min-w-0 flex-1">
          <span className={item.resolved ? "text-muted-foreground line-through" : ""}>
            {item.name}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {busy
              ? "Saving…"
              : item.assignee
                ? `Assigned to ${item.assignee.username}${item.assignee.id === input.userId ? " (you)" : ""}`
                : "Unassigned"}
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="pl-5 text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

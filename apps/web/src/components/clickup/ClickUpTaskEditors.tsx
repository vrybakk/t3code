import { useAtomValue } from "@effect/atom-react";
import type { ClickUpTaskInput, EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { CheckIcon, ChevronDownIcon, PlusIcon, TagIcon } from "lucide-react";
import { useState } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "../ui/command";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

interface Props {
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
  taskName: string;
}

export function ClickUpStatusPicker(
  props: Props & { status: string; color?: string | null | undefined },
) {
  return (
    <TaskEditor {...props} kind="status">
      <ColorDot color={props.color} />
      <span className="uppercase">{props.status}</span>
      <ChevronDownIcon className="size-3 text-muted-foreground" />
    </TaskEditor>
  );
}

export function ClickUpTagsPicker(props: Props & { tags: ReadonlyArray<string> }) {
  return (
    <TaskEditor {...props} kind="tags">
      <span className="flex min-w-0 flex-wrap gap-1.5">
        {props.tags.length ? (
          props.tags.map((tag) => (
            <Badge key={tag} variant="outline" size="control" className="gap-1.5 rounded-md px-2">
              <TagIcon className="size-3" />
              {tag}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">Add tags</span>
        )}
      </span>
      <PlusIcon className="size-3 shrink-0 text-muted-foreground" />
    </TaskEditor>
  );
}

function TaskEditor({
  kind,
  children,
  ...props
}: Props & {
  kind: "status" | "tags";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={`h-auto min-h-7 max-w-full justify-start px-2 py-1 text-xs ${kind === "tags" ? "items-center" : "whitespace-nowrap"}`}
          />
        }
        aria-label={`Change ${kind} for ${props.taskName}`}
      >
        {children}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-72" viewportClassName="p-0">
        {open && <EditorOptions {...props} kind={kind} onDone={() => setOpen(false)} />}
      </PopoverPopup>
    </Popover>
  );
}

function EditorOptions({
  environmentId,
  input,
  kind,
  onDone,
}: Props & {
  kind: "status" | "tags";
  onDone: () => void;
}) {
  const query = serverEnvironment.clickUpTaskOptions({ environmentId, input });
  const result = useAtomValue(query);
  const data = Option.getOrNull(AsyncResult.value(result));
  const setStatus = useAtomCommand(serverEnvironment.clickUpSetStatus);
  const setTag = useAtomCommand(serverEnvironment.clickUpSetTag);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function select(name: string, selected: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response =
        kind === "status"
          ? await setStatus({ environmentId, input: { ...input, status: name } })
          : await setTag({ environmentId, input: { ...input, tag: name, present: !selected } });
      if (response._tag === "Success") {
        if (kind === "status") onDone();
      } else setError("Could not save this change. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }
  const options = !data
    ? []
    : kind === "status"
      ? data.statuses.map((status) => ({
          ...status,
          selected: status.name === data.status,
          group: statusGroup(status.type),
        }))
      : [
          ...data.tags,
          ...data.currentTags
            .filter((tag) => !data.tags.some((item) => item.name === tag))
            .map((name) => ({ name, color: null })),
        ].map((tag) => ({ ...tag, selected: data.currentTags.includes(tag.name), group: "" }));
  const visible = options.filter((item) =>
    item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const groups = [...new Set(visible.map((item) => item.group))];
  return (
    <Command mode="none" value={search} onValueChange={setSearch} aria-label={`Choose ${kind}`}>
      <CommandInput placeholder={`Search ${kind}…`} aria-label={`Search ${kind}`} />
      {AsyncResult.isFailure(result) ? (
        <div className="space-y-2 p-3 text-xs">
          <p role="alert" className="text-destructive">
            Could not load available {kind}.
          </p>
          <Button size="sm" variant="outline" onClick={() => appAtomRegistry.refresh(query)}>
            Retry
          </Button>
        </div>
      ) : !data ? (
        <p role="status" className="p-3 text-xs text-muted-foreground">
          Loading…
        </p>
      ) : (
        <CommandList className="max-h-80 overflow-y-auto p-1">
          {groups.map((group) => (
            <div key={group}>
              {group && <p className="px-2 pt-3 pb-1 text-xs text-muted-foreground">{group}</p>}
              {visible
                .filter((item) => item.group === group)
                .map((item) => (
                  <CommandItem
                    key={item.name}
                    value={item.name}
                    className="gap-2"
                    disabled={busy || result.waiting || (kind === "status" && item.selected)}
                    onClick={() => void select(item.name, item.selected)}
                  >
                    <ColorDot color={item.color} />
                    <span className={`min-w-0 flex-1 ${kind === "status" ? "uppercase" : ""}`}>
                      {item.name}
                    </span>
                    {item.selected && <CheckIcon className="size-3.5" />}
                  </CommandItem>
                ))}
            </div>
          ))}
          {!visible.length && (
            <p className="p-3 text-xs text-muted-foreground">No matching {kind}.</p>
          )}
        </CommandList>
      )}
      {busy && (
        <p role="status" className="px-3 pb-2 text-xs text-muted-foreground">
          Saving…
        </p>
      )}
      {error && (
        <p role="alert" className="px-3 pb-3 text-xs text-destructive">
          {error}
        </p>
      )}
    </Command>
  );
}

function statusGroup(type: string | null): string {
  return type === "open"
    ? "Not started"
    : type === "done"
      ? "Done"
      : type === "closed"
        ? "Closed"
        : "Active";
}

function ColorDot({ color }: { color?: string | null | undefined }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full bg-muted-foreground"
      style={color && /^#[0-9a-f]{3,8}$/i.test(color) ? { backgroundColor: color } : undefined}
    />
  );
}

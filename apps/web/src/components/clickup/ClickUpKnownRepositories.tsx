import type { ClickUpRepositoryLink } from "@t3tools/contracts";
import { useId, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { githubRepositoryName, repositoryKey } from "./projectMappings";

export function ClickUpKnownRepositories({
  value,
  onChange,
  onRemove,
  disabled,
}: {
  value: ReadonlyArray<ClickUpRepositoryLink>;
  onChange: (value: ReadonlyArray<ClickUpRepositoryLink>) => void;
  onRemove: (link: ClickUpRepositoryLink) => void;
  disabled: boolean;
}) {
  const id = useId();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  function add() {
    const name = githubRepositoryName(input);
    if (!name) {
      setError("Enter a GitHub URL, such as https://github.com/company/project.");
      return;
    }
    const remoteUrl = `https://github.com/${name}`;
    if (!value.some((link) => repositoryKey(link.remoteUrl) === repositoryKey(remoteUrl)))
      onChange([...value, { remoteUrl }]);
    setInput("");
    setError(null);
  }
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm">
        Known GitHub repository
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="https://github.com/company/project"
          disabled={disabled}
        />
        <Button variant="outline" disabled={disabled || !input.trim()} onClick={add}>
          Add
        </Button>
      </div>
      {value.map((link) => (
        <div
          key={repositoryKey(link.remoteUrl)}
          className="flex items-center justify-between gap-2 text-xs"
        >
          <span className="min-w-0 break-all">{link.remoteUrl}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onChange(value.filter((item) => item !== link));
              onRemove(link);
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Saved once for every task in this scope. Missing repositories can be downloaded after you
        confirm their location.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

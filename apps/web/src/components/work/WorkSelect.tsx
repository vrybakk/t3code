import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

interface WorkSelectOption {
  readonly value: string;
  readonly label: string;
  readonly title?: string;
}

export function WorkSelect({
  id,
  value,
  onValueChange,
  options,
  disabled,
}: {
  readonly id: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: ReadonlyArray<WorkSelectOption>;
  readonly disabled?: boolean;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="min-w-0" title={selected?.title}>
        <SelectValue>{selected?.label ?? "Choose a project"}</SelectValue>
      </SelectTrigger>
      <SelectPopup alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} title={option.title}>
            <span className="truncate">{option.label}</span>
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

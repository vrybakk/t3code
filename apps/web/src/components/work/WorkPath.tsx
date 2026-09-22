import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { workPathName } from "./workPresentation";

export function WorkPath({ path, name }: { readonly path: string; readonly name?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} />} className="block min-w-0 truncate">
        {name ?? workPathName(path)}
      </TooltipTrigger>
      <TooltipPopup className="max-w-sm break-all">{path}</TooltipPopup>
    </Tooltip>
  );
}

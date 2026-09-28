import type { SidebarProjectGroupingMode } from "@t3tools/contracts";

import type { SidebarProjectGroupMember } from "../../sidebarProjectGrouping";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

const GROUPING_LABELS: Record<SidebarProjectGroupingMode, string> = {
  repository: "Group by repository",
  repository_path: "Group by repository path",
  separate: "Keep separate",
};

function groupingDescription(mode: SidebarProjectGroupingMode): string {
  switch (mode) {
    case "repository":
      return "Projects from the same repository share one sidebar row.";
    case "repository_path":
      return "Projects group only when both the repository and repo-relative path match.";
    case "separate":
      return "Every project path gets its own sidebar row.";
  }
}

interface ProjectGroupActionDialogsProps {
  renameTarget: SidebarProjectGroupMember | null;
  renameTitle: string;
  setRenameTitle: (title: string) => void;
  closeRename: () => void;
  saveRename: () => Promise<void>;
  groupingTarget: SidebarProjectGroupMember | null;
  groupingSelection: SidebarProjectGroupingMode | "inherit";
  setGroupingSelection: (selection: SidebarProjectGroupingMode | "inherit") => void;
  groupingMode: SidebarProjectGroupingMode;
  closeGrouping: () => void;
  saveGrouping: () => void;
}

export function ProjectGroupActionDialogs({
  renameTarget,
  renameTitle,
  setRenameTitle,
  closeRename,
  saveRename,
  groupingTarget,
  groupingSelection,
  setGroupingSelection,
  groupingMode,
  closeGrouping,
  saveGrouping,
}: ProjectGroupActionDialogsProps) {
  return (
    <>
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeRename();
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              {renameTarget
                ? `Update the title for ${renameTarget.workspaceRoot}.`
                : "Update the project title."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Project title</span>
              <Input
                aria-label="Project title"
                value={renameTitle}
                onChange={(event) => setRenameTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveRename();
                  }
                }}
              />
            </div>
            {renameTarget?.environmentLabel ? (
              <p className="text-xs text-muted-foreground">
                Environment: {renameTarget.environmentLabel}
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={closeRename}>
              Cancel
            </Button>
            <Button onClick={() => void saveRename()}>Save</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      <Dialog
        open={groupingTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeGrouping();
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Project grouping</DialogTitle>
            <DialogDescription>
              {groupingTarget
                ? `Choose how ${groupingTarget.workspaceRoot} should be grouped in the sidebar.`
                : "Choose how this project should be grouped in the sidebar."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Grouping rule</span>
              <Select
                value={groupingSelection}
                onValueChange={(value) => {
                  if (
                    value === "inherit" ||
                    value === "repository" ||
                    value === "repository_path" ||
                    value === "separate"
                  ) {
                    setGroupingSelection(value);
                  }
                }}
              >
                <SelectTrigger className="w-full" aria-label="Project grouping rule">
                  <SelectValue>
                    {groupingSelection === "inherit"
                      ? `Use global default (${GROUPING_LABELS[groupingMode]})`
                      : GROUPING_LABELS[groupingSelection]}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="inherit">
                    Use global default
                  </SelectItem>
                  <SelectItem hideIndicator value="repository">
                    {GROUPING_LABELS.repository}
                  </SelectItem>
                  <SelectItem hideIndicator value="repository_path">
                    {GROUPING_LABELS.repository_path}
                  </SelectItem>
                  <SelectItem hideIndicator value="separate">
                    {GROUPING_LABELS.separate}
                  </SelectItem>
                </SelectPopup>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {groupingDescription(
                groupingSelection === "inherit" ? groupingMode : groupingSelection,
              )}
            </p>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={closeGrouping}>
              Cancel
            </Button>
            <Button onClick={saveGrouping}>Save</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

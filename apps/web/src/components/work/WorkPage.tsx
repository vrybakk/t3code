import { Tabs } from "@base-ui/react/tabs";
import { Link } from "@tanstack/react-router";
import {
  type EnvironmentId,
  PRIMARY_LOCAL_ENVIRONMENT_ID,
  type WorkRecord,
} from "@t3tools/contracts";
import { useRef, useState } from "react";

import { isElectron } from "../../env";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useWorkMutations } from "../../state/workTracking";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset } from "../ui/sidebar";
import { toggleVariants } from "../ui/toggle";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { WorkEntryDialog } from "./WorkEntryDialog";
import { WorkOverview } from "./WorkOverview";
import { WorkReportsPanel } from "./WorkReportsPanel";
import { WorkRunningSessions } from "./WorkRunningSessions";
import { useWorkData } from "./useWorkData";

export function WorkPage() {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = primaryEnvironmentId ?? (PRIMARY_LOCAL_ENVIRONMENT_ID as EnvironmentId);
  return <WorkEnvironmentPage key={environmentId} environmentId={environmentId} />;
}

function WorkEnvironmentPage({ environmentId }: { environmentId: EnvironmentId }) {
  const [section, setSection] = useState("overview");
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const { overview, timeZone, threads, loading } = useWorkData(environmentId);
  const mutations = useWorkMutations(environmentId);
  const [entryOpen, setEntryOpen] = useState(false);
  const [editing, setEditing] = useState<WorkRecord | null>(null);
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <Tabs.Root
        value={section}
        onValueChange={(value) => {
          if (value !== "overview" && value !== "reports") return;
          scrollViewportRef.current?.scrollTo({ top: 0 });
          setSection(value);
        }}
        className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground"
      >
        <WorkspacePageHeader electron={isElectron} className="h-auto">
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 py-2">
            <h1>Work</h1>
            <Tabs.List
              aria-label="Work section"
              className="flex gap-0.5 rounded-lg bg-input/40 p-0.5"
            >
              {[
                ["overview", "Overview"],
                ["reports", "Reports"],
              ].map(([value, label]) => (
                <Tabs.Tab
                  key={value}
                  value={value}
                  data-pressed={section === value ? "" : undefined}
                  className={toggleVariants({ variant: "segmented", size: "segmented" })}
                >
                  {label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </div>
        </WorkspacePageHeader>
        <ScrollArea viewportRef={scrollViewportRef} className="min-h-0 flex-1">
          <WorkspacePageContainer width="wide" className="py-6">
            {overview === null ? (
              <p role={loading ? "status" : "alert"} className="text-sm text-muted-foreground">
                {loading
                  ? "Loading local work ledger…"
                  : "Work is unavailable for this environment."}
              </p>
            ) : (
              <>
                {overview.profile === null ? (
                  <Link
                    to="/settings/work"
                    search={{ machine: environmentId }}
                    className="rounded-lg border border-dashed p-4 text-left text-sm text-muted-foreground hover:text-foreground"
                  >
                    Complete your Work profile in Settings to start recording time.
                  </Link>
                ) : null}
                <WorkRunningSessions
                  threads={threads}
                  projects={overview.projects}
                  enabled={overview.profile?.trackingEnabled ?? false}
                />
                <Tabs.Panel value="overview" className="space-y-6">
                  <WorkOverview
                    key={timeZone}
                    environmentId={environmentId}
                    timeZone={timeZone}
                    projects={overview.projects}
                    canAddEntry={overview.profile !== null && overview.projects.length > 0}
                    onAddEntry={() => {
                      setEditing(null);
                      setEntryOpen(true);
                    }}
                  />
                </Tabs.Panel>
                <Tabs.Panel value="reports">
                  <WorkReportsPanel
                    environmentId={environmentId}
                    overview={overview}
                    timeZone={timeZone}
                    threads={threads}
                    onEdit={(record) => {
                      setEditing(record);
                      setEntryOpen(true);
                    }}
                  />
                </Tabs.Panel>
                <WorkEntryDialog
                  open={entryOpen}
                  onOpenChange={setEntryOpen}
                  record={editing}
                  projects={overview.projects}
                  threads={threads}
                  onSave={async (input) => (await mutations.saveManual(input))._tag === "Success"}
                />
              </>
            )}
          </WorkspacePageContainer>
        </ScrollArea>
      </Tabs.Root>
    </SidebarInset>
  );
}

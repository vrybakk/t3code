import { act, createContext, useContext, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/unstable/reactivity";
import type { WorkOverviewInput } from "@t3tools/contracts";

const state = vi.hoisted(() => ({ queries: [] as WorkOverviewInput[] }));
vi.mock("@base-ui/react/tabs", () => {
  const Context = createContext("overview");
  return {
    Tabs: {
      Root: ({
        value,
        onValueChange,
        children,
      }: {
        value: string;
        onValueChange: (value: string) => void;
        children: ReactNode;
      }) => (
        <Context value={value}>
          <button onClick={() => onValueChange("overview")}>Open overview</button>
          <button onClick={() => onValueChange("reports")}>Open reports</button>
          {children}
        </Context>
      ),
      List: ({ children }: { children: ReactNode }) => children,
      Tab: () => null,
      Panel: ({
        value,
        keepMounted,
        children,
      }: {
        value: string;
        keepMounted?: boolean;
        children: ReactNode;
      }) => (keepMounted || useContext(Context) === value ? children : null),
    },
  };
});
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("../../env", () => ({ isElectron: false }));
vi.mock("../../state/environments", () => ({ usePrimaryEnvironmentId: () => "env" }));
vi.mock("../../state/workTracking", () => ({ useWorkMutations: () => ({}) }));
vi.mock("./useWorkData", () => ({
  useWorkData: () => ({
    overview: {
      profile: {},
      projects: [{ id: "project", name: "Project" }],
      deliveries: [],
      reports: [],
    },
    timeZone: "Europe/Madrid",
    threads: [],
    loading: false,
  }),
}));
vi.mock("../ui/scroll-area", () => ({ ScrollArea: "div" }));
vi.mock("../ui/sidebar", () => ({ SidebarInset: "main" }));
vi.mock("../ui/toggle", () => ({ toggleVariants: () => "" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/label", () => ({ Label: "label" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../WorkspacePageContainer", () => ({ WorkspacePageContainer: "div" }));
vi.mock("../WorkspacePageHeader", () => ({ WorkspacePageHeader: "header" }));
vi.mock("./WorkOverview", () => ({ WorkOverview: () => null }));
vi.mock("./WorkRunningSessions", () => ({ WorkRunningSessions: () => null }));
vi.mock("./WorkEntryDialog", () => ({ WorkEntryDialog: () => null }));
vi.mock("./WorkDeliveries", () => ({ WorkDeliveries: () => null }));
vi.mock("./WorkReports", () => ({ WorkReports: () => null }));
vi.mock("./WorkReportSnapshotPrint", () => ({ WorkReportSnapshotPrint: () => null }));
vi.mock("./WorkMonthlyReport", () => ({
  WorkMonthlyReport: ({
    month,
    onMonthChange,
    projectId,
    onProjectChange,
  }: {
    month: string;
    onMonthChange: (value: string) => void;
    projectId: string;
    onProjectChange: (value: string) => void;
  }) => (
    <>
      <input id="month" value={month} onChange={(event) => onMonthChange(event.target.value)} />
      <input
        id="project"
        value={projectId}
        onChange={(event) => onProjectChange(event.target.value)}
      />
    </>
  ),
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    workOverview: ({ input }: { input: WorkOverviewInput }) => {
      state.queries.push(input);
      return input;
    },
  },
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (input: WorkOverviewInput) =>
    "since" in input
      ? AsyncResult.success({
          records: [],
          totals: { records: 60 },
          recordPage: { offset: input.recordOffset, limit: 25 },
        })
      : AsyncResult.initial(),
}));

import { WorkPage } from "./WorkPage";

let renderer: ReactTestRenderer;
afterEach(() => act(() => renderer?.unmount()));
function click(label: string) {
  act(() =>
    renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes(label))!
      .props.onClick(),
  );
}
function change(id: string, value: string) {
  act(() => renderer.root.findByProps({ id }).props.onChange({ target: { value } }));
}
function setup() {
  state.queries = [];
  act(() => {
    renderer = create(<WorkPage />);
  });
  expect(state.queries).toHaveLength(0);
  click("Open reports");
  change("month", "2026-08");
  change("work-activity-from", "2026-08-10");
  change("work-activity-through", "2026-08-20");
}

it("retains custom dates while changing projects and resets only the activity page", () => {
  setup();
  click("Next");
  expect(state.queries.at(-1)?.recordOffset).toBe(25);
  change("project", "project");
  expect(renderer.root.findByProps({ id: "work-activity-from" }).props.value).toBe("2026-08-10");
  expect(renderer.root.findByProps({ id: "work-activity-through" }).props.value).toBe("2026-08-20");
  expect(state.queries.at(-1)).toMatchObject({
    trackingProjectId: "project",
    recordOffset: 0,
    since: "2026-08-09T22:00:00.000Z",
    until: "2026-08-20T22:00:00.000Z",
  });
});

it("preserves report filters and pagination across tabs without querying hidden activity", () => {
  setup();
  change("project", "project");
  click("Next");
  state.queries = [];
  click("Open overview");
  expect(state.queries).toHaveLength(0);
  click("Open reports");
  expect(renderer.root.findByProps({ id: "month" }).props.value).toBe("2026-08");
  expect(renderer.root.findByProps({ id: "project" }).props.value).toBe("project");
  expect(state.queries.at(-1)).toMatchObject({
    trackingProjectId: "project",
    recordOffset: 25,
    since: "2026-08-09T22:00:00.000Z",
    until: "2026-08-20T22:00:00.000Z",
  });
});

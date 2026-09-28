import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/unstable/reactivity";
import { EnvironmentId, ThreadId, type ClickUpTimeRecord } from "@t3tools/contracts";

const state = vi.hoisted(() => ({ result: null as unknown, sync: vi.fn(), refresh: vi.fn() }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => state.result }));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: { refresh: state.refresh } }));
vi.mock("../../state/server", () => ({
  serverEnvironment: { clickUpTimePreview: () => "query", clickUpTimeSync: "sync" },
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.sync }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../work/WorkSelect", () => ({
  WorkSelect: ({
    id,
    value,
    onValueChange,
  }: {
    id: string;
    value: string;
    onValueChange: (value: string) => void;
  }) => <select id={id} value={value} onChange={(event) => onValueChange(event.target.value)} />,
}));
import { ClickUpTimeSyncRecords } from "./ClickUpTimeSyncRecords";

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.clearAllMocks();
});
const task = { workspaceId: "42", taskId: "one", name: "First task" };
const base: ClickUpTimeRecord = {
  recordId: "single",
  fingerprint: "version1",
  kind: "manual",
  threadId: ThreadId.make("thread"),
  threadTitle: "Thread",
  start: 1000,
  duration: 60000,
  tasks: [task],
  state: "pending",
  destination: null,
};
it("preselects a single task, requires multi-task allocation, and sends each selected record once", async () => {
  state.result = AsyncResult.success({
    records: [
      base,
      {
        ...base,
        recordId: "multiple",
        tasks: [task, { ...task, taskId: "two", name: "Second task" }],
      },
    ],
    unlinkedCount: 0,
    hasMore: false,
  });
  state.sync.mockResolvedValue({ _tag: "Success", value: { results: [] } });
  await act(() => {
    renderer = create(
      <ClickUpTimeSyncRecords
        environmentId={EnvironmentId.make("env")}
        userId={7}
        onBusyChange={() => {}}
      />,
    );
  });
  expect(renderer!.root.findByProps({ id: "time-task-single" }).props.value).toBe("42/one");
  expect(renderer!.root.findByProps({ id: "time-task-multiple" }).props.value).toBe("");
  const buttons = () => renderer!.root.findAllByType("button");
  const syncButton = () => buttons().find((b) => String(b.props.children).startsWith("Sync "))!;
  expect(syncButton().props.children).toBe("Sync 1 selected");
  await act(() =>
    renderer!.root.findAllByType("select")[1]!.props.onChange({ target: { value: "42/two" } }),
  );
  expect(syncButton().props.children).toBe("Sync 2 selected");
  await act(async () => {
    await syncButton().props.onClick();
  });
  expect(state.sync).toHaveBeenCalledTimes(1);
  expect(state.sync.mock.calls[0]![0].input.records).toEqual([
    { recordId: "single", fingerprint: "version1", workspaceId: "42", taskId: "one" },
    { recordId: "multiple", fingerprint: "version1", workspaceId: "42", taskId: "two" },
  ]);
});

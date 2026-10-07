import { EnvironmentId, ProjectId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  openPanel: vi.fn(),
  openLink: vi.fn(),
  showMenu: vi.fn(),
  openExternal: vi.fn(),
  openPreview: vi.fn(),
  recordVisit: vi.fn(),
  copy: vi.fn(),
  toast: vi.fn(),
}));
const environmentId = EnvironmentId.make("remote");
const threadId = ThreadId.make("thread");
const projectId = ProjectId.make("project");
const url = "https://github.com/acme/app/pull/42";
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("../state/entities", () => ({
  useProjects: () =>
    [EnvironmentId.make("other"), environmentId].map((id) => ({
      id: id === environmentId ? projectId : ProjectId.make("other-project"),
      environmentId: id,
      repositoryIdentity: {
        provider: "github",
        displayName: "acme/app",
        canonicalKey: "github.com/acme/app",
        locator: {
          source: "git-remote",
          remoteName: "origin",
          remoteUrl: "https://github.com/acme/app.git",
        },
      },
    })),
  useServerConfigs: () =>
    new Map([
      [
        environmentId,
        { environment: { capabilities: { pullRequests: true, threadPullRequests: true } } },
      ],
    ]),
}));
vi.mock("../state/environments", () => ({ usePrimaryEnvironmentId: () => "other" }));
vi.mock("../rightPanelStore", () => ({
  useRightPanelStore: { getState: () => ({ openPullRequest: state.openPanel }) },
}));
vi.mock("../browser/useOpenLink", () => ({ useOpenLink: () => state.openLink }));
vi.mock("../browser/browserLinkTarget", () => ({
  canOpenLinksInApp: (threadRef: ScopedThreadRef | undefined) => threadRef != null,
}));
vi.mock("../browser/openFileInPreview", () => ({ openUrlInPreview: state.openPreview }));
vi.mock("../browserHistoryStore", () => ({ recordVisitForThread: state.recordVisit }));
vi.mock("../hooks/useCopyToClipboard", () => ({ writeTextToClipboard: state.copy }));
vi.mock("../localApi", () => ({
  readLocalApi: () => ({
    contextMenu: { show: state.showMenu },
    shell: { openExternal: state.openExternal },
  }),
}));
vi.mock("../state/preview", () => ({ previewEnvironment: { open: "preview" } }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => state.openPreview }));
vi.mock("./ui/toast", () => ({ toastManager: { add: state.toast } }));
import { ExternalLink } from "./ExternalLink";

let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.openLink.mockResolvedValue(undefined);
  state.openPreview.mockResolvedValue({ _tag: "Success" });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
async function mount(selectedThread: ThreadId | undefined = threadId, href = url) {
  await act(async () => {
    renderer = create(
      <ExternalLink
        environmentId={environmentId}
        threadRef={selectedThread ? { environmentId, threadId: selectedThread } : undefined}
        url={href}
      >
        acme/app #42
      </ExternalLink>,
    );
  });
}
function event() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    metaKey: false,
    ctrlKey: false,
    clientX: 12,
    clientY: 24,
  };
}
it("opens the native PR beside the current thread in its own environment", async () => {
  await mount();
  const click = event();
  await act(async () => renderer.root.findByType("a").props.onClick(click));
  expect(state.openPanel).toHaveBeenCalledWith(
    { environmentId, threadId },
    {
      projectId,
      host: "github.com",
      repository: "acme/app",
      url,
      number: 42,
    },
  );
  expect(click.preventDefault).toHaveBeenCalled();
  expect(state.openLink).not.toHaveBeenCalled();
  expect(state.openExternal).not.toHaveBeenCalled();
});
it("opens a standalone handoff in the native PR page using its environment", async () => {
  await act(async () => {
    renderer = create(
      <ExternalLink environmentId={environmentId} url={url}>
        PR
      </ExternalLink>,
    );
  });
  await act(async () => renderer.root.findByType("a").props.onClick(event()));
  expect(state.navigate).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "/pull-requests",
      search: expect.objectContaining({
        selectedEnvironmentId: environmentId,
        selectedProjectId: projectId,
        number: 42,
      }),
    }),
  );
  expect(state.openPanel).not.toHaveBeenCalled();
});
it.each(["metaKey", "ctrlKey"])(
  "leaves %s click to the anchor browser action",
  async (modifier) => {
    await mount();
    const click = { ...event(), [modifier]: true };
    await act(async () => renderer.root.findByType("a").props.onClick(click));
    expect(click.preventDefault).not.toHaveBeenCalled();
    expect(state.openPanel).not.toHaveBeenCalled();
    expect(state.openLink).not.toHaveBeenCalled();
  },
);
it("uses normal link preferences when no project supports the PR host", async () => {
  const unknownUrl = "https://unknown.example/acme/app/pull/42";
  await mount(threadId, unknownUrl);
  await act(async () => renderer.root.findByType("a").props.onClick(event()));
  expect(state.openPanel).not.toHaveBeenCalled();
  expect(state.openLink).toHaveBeenCalledWith(unknownUrl);
});
it.each(["open-in-preview", "open-external", "copy-link"])(
  "honors the explicit %s context-menu action",
  async (action) => {
    state.showMenu.mockResolvedValue(action);
    await mount();
    await act(async () => renderer.root.findByType("a").props.onContextMenu(event()));
    expect(state.showMenu).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "open-in-preview" }),
        expect.objectContaining({ id: "open-external" }),
        expect.objectContaining({ id: "copy-link" }),
      ]),
      { x: 12, y: 24 },
    );
    expect(state.openPanel).not.toHaveBeenCalled();
    if (action === "open-in-preview") {
      expect(state.openPreview).toHaveBeenCalledWith({
        threadRef: { environmentId, threadId },
        url,
        openPreview: state.openPreview,
      });
      expect(state.recordVisit).toHaveBeenCalledWith({ environmentId, threadId }, url);
      expect(state.openExternal).not.toHaveBeenCalled();
    } else if (action === "open-external") {
      expect(state.openExternal).toHaveBeenCalledWith(url);
      expect(state.openPreview).not.toHaveBeenCalled();
    } else {
      expect(state.copy).toHaveBeenCalledWith(url, "link");
    }
  },
);

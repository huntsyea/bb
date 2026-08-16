// @vitest-environment jsdom

import type { ComponentProps, CSSProperties, ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompactViewportOverrideProvider } from "@bb/shared-ui/hooks/use-compact-viewport";
import {
  CONVERSATION_DRAWER_CONTROL_LABEL,
  CONVERSATION_PENDING_INDICATOR_LABEL,
  resolveConversationPendingIndicatorElementId,
} from "@/components/secondary-panel/panelToggleControlState";
import { dispatchBrowserViewBoundsSync } from "@/lib/browser-view-bounds-sync";
import { ThreadDetailSecondaryContent } from "./ThreadDetailSecondaryContent";
import {
  DefaultPaneContextProvider,
  PaneContext,
  type PaneContextValue,
  type PaneSecondaryPanelViewModel,
} from "./PaneContext";
import { MemoryRouter } from "react-router-dom";
import type { ThreadSurfaceArrangement } from "./ThreadSurfaceHost";

type ThreadDetailSecondaryContentProps = ComponentProps<
  typeof ThreadDetailSecondaryContent
>;
type RenderBrowserDeck = NonNullable<
  ThreadDetailSecondaryContentProps["secondaryPanel"]["renderBrowserDeck"]
>;
type DrawerShellCallback = (open: boolean) => void;

const drawerShellState = vi.hoisted(() => ({
  onContentAnimationEnd: undefined as DrawerShellCallback | undefined,
}));

vi.mock("@/lib/browser-view-bounds-sync", () => ({
  dispatchBrowserViewBoundsSync: vi.fn(),
}));

vi.mock("@/lib/bb-desktop", () => ({
  DEFAULT_DESKTOP_WINDOW_STATE: { isFullScreen: false },
  getBbDesktopInfo: () => null,
  shouldReserveMacosTrafficLights: () => false,
  shouldUseMacosDesktopChrome: () => false,
}));

vi.mock("@/components/ui/sidebar.js", () => ({
  useOptionalIsSidebarShowing: () => true,
}));

vi.mock("@/hooks/queries/thread-queries", () => ({
  useThreads: () => ({ data: [] }),
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtomValue: () => 50,
}));

vi.mock("react-resizable-panels", async () => {
  const React = await import("react");

  const PanelGroup = React.forwardRef<
    { setLayout: (layout: number[]) => void },
    { children?: ReactNode }
  >(({ children }, ref) => {
    React.useImperativeHandle(ref, () => ({ setLayout: () => {} }), []);
    return React.createElement(
      "div",
      { "data-testid": "panel-group" },
      children,
    );
  });
  PanelGroup.displayName = "MockPanelGroup";

  const Panel = ({
    children,
    order,
    style,
  }: {
    children?: ReactNode;
    order?: number;
    style?: CSSProperties;
  }) =>
    React.createElement(
      "div",
      { "data-panel-order": order, "data-testid": "panel", style },
      children,
    );

  return { Panel, PanelGroup };
});

vi.mock("@bb/shared-ui/responsive-overlay", async () => {
  const React = await import("react");

  const ResponsiveDrawerShell = ({
    children,
    contentClassName,
    onContentAnimationEnd,
    onOpenChange,
    open,
    srLabel,
  }: {
    children?: ReactNode;
    contentClassName?: string;
    onContentAnimationEnd?: DrawerShellCallback;
    onOpenChange?: (open: boolean) => void;
    open: boolean;
    srLabel?: string;
  }) => {
    drawerShellState.onContentAnimationEnd = onContentAnimationEnd;
    return React.createElement(
      "div",
      {
        "data-content-class-name": contentClassName,
        "data-open": String(open),
        "data-sr-label": srLabel,
        "data-testid": "responsive-drawer-shell",
      },
      React.createElement(
        "button",
        {
          onClick: () => onOpenChange?.(false),
          type: "button",
        },
        "Dismiss drawer",
      ),
      children,
    );
  };

  return { ResponsiveDrawerShell };
});

vi.mock(
  "@/components/secondary-panel/ThreadMetadataContent",
  async (importOriginal) => {
    const React = await import("react");
    const actual =
      await importOriginal<
        typeof import("@/components/secondary-panel/ThreadMetadataContent")
      >();

    return {
      ...actual,
      ThreadMetadataCard: ({
        children,
      }: ComponentProps<typeof actual.ThreadMetadataCard>) =>
        React.createElement(
          "div",
          { "data-testid": "metadata-card" },
          children,
        ),
      ThreadMetadataContent: (
        _props: ComponentProps<typeof actual.ThreadMetadataContent>,
      ) => React.createElement("div", { "data-testid": "metadata-content" }),
      hasAnyThreadMetadata: () => false,
    };
  },
);

vi.mock(
  "@/components/secondary-panel/ThreadSecondaryPanel",
  async (importOriginal) => {
    const React = await import("react");
    const actual =
      await importOriginal<
        typeof import("@/components/secondary-panel/ThreadSecondaryPanel")
      >();
    const {
      CONVERSATION_DRAWER_CONTROL_LABEL,
      CONVERSATION_PENDING_INDICATOR_LABEL,
      resolveWorkModeControl,
    } = await import("@/components/secondary-panel/panelToggleControlState");

    type FixtureProps = Pick<
      ComponentProps<typeof actual.ThreadSecondaryPanel>,
      | "browserDeck"
      | "conversationDrawer"
      | "inlinePanelToggle"
      | "isOpen"
      | "isWorkMode"
      | "onToggleWorkMode"
      | "renderAsDrawer"
      | "resizablePanelLayout"
      | "withoutResizablePanel"
      | "workModeToggleId"
    >;

    const ThreadSecondaryPanel = ({
      browserDeck,
      conversationDrawer,
      inlinePanelToggle,
      isOpen,
      isWorkMode,
      onToggleWorkMode,
      renderAsDrawer,
      resizablePanelLayout,
      withoutResizablePanel,
      workModeToggleId,
    }: ComponentProps<typeof actual.ThreadSecondaryPanel>) =>
      React.createElement(StatefulSecondaryPanelFixture, {
        browserDeck,
        conversationDrawer,
        inlinePanelToggle,
        isOpen,
        isWorkMode,
        onToggleWorkMode,
        renderAsDrawer,
        resizablePanelLayout,
        withoutResizablePanel,
        workModeToggleId,
      });

    function StatefulSecondaryPanelFixture({
      browserDeck,
      conversationDrawer,
      inlinePanelToggle,
      isOpen,
      isWorkMode = false,
      onToggleWorkMode,
      renderAsDrawer,
      resizablePanelLayout,
      withoutResizablePanel = false,
      workModeToggleId,
    }: FixtureProps) {
      const [activeResource, setActiveResource] = React.useState("notes.md");
      // Mirror the real toolbar's accessible surface so the layout owner's
      // wiring (ids, pressed/expanded state, pending indication) is observable
      // here. Names come from the real module, not copies.
      const workModeControl =
        onToggleWorkMode === undefined
          ? null
          : resolveWorkModeControl({ isWorkMode, onToggleWorkMode });
      return React.createElement(
        "section",
        {
          "data-open": String(isOpen),
          "data-inline-panel-toggle": inlinePanelToggle,
          "data-panel-order": resizablePanelLayout?.panelOrder,
          "data-testid": renderAsDrawer
            ? "drawer-secondary-panel"
            : "inline-secondary-panel",
          "data-without-resizable-panel": String(withoutResizablePanel),
          style: { order: resizablePanelLayout?.visualOrder },
        },
        conversationDrawer
          ? React.createElement(
              "div",
              { key: "conversation-drawer-control" },
              React.createElement(
                "button",
                {
                  "aria-describedby": conversationDrawer.hasPendingInteraction
                    ? conversationDrawer.pendingIndicatorId
                    : undefined,
                  "aria-expanded": conversationDrawer.isOpen,
                  "aria-haspopup": "dialog",
                  "aria-label": CONVERSATION_DRAWER_CONTROL_LABEL,
                  "data-testid": "thread-conversation-drawer-toggle",
                  onClick: conversationDrawer.onToggle,
                  type: "button",
                },
                "Conversation",
              ),
              conversationDrawer.hasPendingInteraction
                ? React.createElement(
                    "span",
                    {
                      "data-testid": "thread-conversation-pending-indicator",
                      id: conversationDrawer.pendingIndicatorId,
                      role: "status",
                    },
                    CONVERSATION_PENDING_INDICATOR_LABEL,
                  )
                : null,
            )
          : null,
        workModeControl
          ? React.createElement(
              "button",
              {
                "aria-label": workModeControl.label,
                "aria-pressed": workModeControl.isPressed,
                "data-testid": "thread-work-mode-toggle",
                disabled: workModeControl.disabled,
                id: workModeToggleId,
                key: "work-mode-control",
                onClick: workModeControl.onClick,
                type: "button",
              },
              workModeControl.label,
            )
          : null,
        React.createElement(
          "button",
          {
            onClick: () => setActiveResource("preview.pdf"),
            type: "button",
          },
          "Open preview",
        ),
        React.createElement(
          "button",
          {
            onClick: () => setActiveResource("docs"),
            type: "button",
          },
          "Open docs",
        ),
        React.createElement(
          "div",
          { "data-testid": "active-resource" },
          activeResource,
        ),
        browserDeck,
      );
    }

    return { ...actual, ThreadSecondaryPanel };
  },
);

vi.mock("./ThreadTimelinePane", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal<typeof import("./ThreadTimelinePane")>();

  const ThreadTimelinePane = ({
    footer,
    threadId,
  }: ComponentProps<typeof actual.ThreadTimelinePane>) =>
    React.createElement(
      "div",
      {
        "data-testid": "thread-timeline-pane",
        "data-thread-id": threadId,
        tabIndex: -1,
      },
      footer,
    );

  return { ...actual, ThreadTimelinePane };
});

interface QueuedAnimationFrames {
  cancelAnimationFrame: ReturnType<typeof vi.spyOn>;
  flushAll: () => void;
  requestAnimationFrame: ReturnType<typeof vi.spyOn>;
  size: () => number;
}

interface RenderThreadDetailArgs {
  arrangement?: ThreadSurfaceArrangement;
  hasPendingInteraction?: boolean;
  isFocusedHosted?: boolean;
  isCompactViewport: boolean;
  isSecondaryPanelOpen: boolean;
  isWorkMode?: boolean;
  onToggleWorkMode?: () => void;
  renderBrowserDeck: RenderBrowserDeck;
  threadId: string;
}

const noop = () => {};

let publishedHostedPanel: PaneSecondaryPanelViewModel | null = null;
const hostedPaneRegistration = {
  clear: () => {
    publishedHostedPanel = null;
  },
  publish: (model: PaneSecondaryPanelViewModel) => {
    publishedHostedPanel = model;
  },
};

function ThreadDetailTestPaneProvider({
  children,
  isFocusedHosted,
}: {
  children: ReactNode;
  isFocusedHosted: boolean | undefined;
}) {
  if (isFocusedHosted === undefined) {
    return (
      <MemoryRouter>
        <DefaultPaneContextProvider>{children}</DefaultPaneContextProvider>
      </MemoryRouter>
    );
  }
  const value: PaneContextValue = {
    paneId: "pane-test",
    isFocused: isFocusedHosted,
    isSplitPane: true,
    secondaryPanelHost: hostedPaneRegistration,
    reservesWindowPanelToggle: false,
    onRequestClose: noop,
    isMaximized: false,
    onToggleMaximize: noop,
    setWorkModeMaximized: null,
    isBoundedPane: true,
    isTopRow: true,
    ownsWindowTopLeft: true,
    navigateInPane: noop,
  };
  return <PaneContext.Provider value={value}>{children}</PaneContext.Provider>;
}

function installAnimationFrameQueue(order?: string[]): QueuedAnimationFrames {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextFrameId = 1;

  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: noop,
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: noop,
  });

  const requestAnimationFrame = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      callbacks.set(frameId, callback);
      order?.push("requestAnimationFrame");
      return frameId;
    });
  const cancelAnimationFrame = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation((frameId) => {
      callbacks.delete(frameId);
    });

  return {
    cancelAnimationFrame,
    flushAll() {
      const pendingCallbacks = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of pendingCallbacks) {
        callback(performance.now());
      }
    },
    requestAnimationFrame,
    size: () => callbacks.size,
  };
}

function makeThread(
  threadId: string,
): ThreadDetailSecondaryContentProps["metadata"]["thread"] {
  return {
    archivedAt: null,
    createdAt: 0,
    deletedAt: null,
    environmentId: null,
    id: threadId,
    lastReadAt: null,
    latestAttentionAt: 0,
    parentThreadId: null,
    pinnedAt: null,
    projectId: "proj-test",
    providerId: "codex",
    sourceThreadId: null,
    originKind: null,
    originPluginId: null,
    visibility: "visible",
    childOrigin: null,
    status: "idle",
    stopRequestedAt: null,
    title: null,
    titleFallback: "Test thread",
    sectionId: null,
    updatedAt: 0,
  } as ThreadDetailSecondaryContentProps["metadata"]["thread"];
}

function createBrowserDeckRenderer(order?: string[]): RenderBrowserDeck {
  return vi.fn(({ canShowNativeBrowserView }) => {
    order?.push(`render:${String(canShowNativeBrowserView)}`);
    return (
      <div
        data-can-show-native-browser-view={String(canShowNativeBrowserView)}
        data-testid="browser-deck"
      />
    );
  });
}

function StatefulConversationHeader() {
  return (
    <div data-testid="header">
      <label>
        Draft
        <input aria-label="Draft" defaultValue="unfinished prompt" />
      </label>
    </div>
  );
}

function createProps({
  arrangement = "conversation-primary",
  hasPendingInteraction = false,
  isSecondaryPanelOpen,
  isWorkMode = false,
  onToggleWorkMode = noop,
  renderBrowserDeck,
  threadId,
}: Omit<
  RenderThreadDetailArgs,
  "isCompactViewport"
>): ThreadDetailSecondaryContentProps {
  return {
    footer: <div data-testid="footer" />,
    hasPendingInteraction,
    header: <StatefulConversationHeader />,
    isBoundedPane: false,
    isConversationCollapsed: false,
    isWorkMode,
    isMetadataLoading: false,
    isSecondaryPanelOpen,
    metadata: {
      canAssignToParent: false,
      canTakeOverThread: false,
      environment: null,
      environmentDisplayHost: { locality: "local", identity: null },
      isLoadingMergeBaseBranchOptions: false,
      mergeBaseBranchOptions: undefined,
      onAssignParent: noop,
      onParentSelectorOpenChange: noop,
      onRetryParentThreads: noop,
      onMergeBaseBranchChange: noop,
      parentThreadDisplayName: null,
      parentThreads: [],
      isLoadingParentThreads: false,
      isParentThreadsError: false,
      projectId: "proj-test",
      pullRequest: null,
      selectedMergeBaseBranch: undefined,
      thread: makeThread(threadId),
      threadSchedules: [],
      updateThreadPending: false,
      workspaceStatus: undefined,
      workspaceStatusError: null,
    } as ThreadDetailSecondaryContentProps["metadata"],
    onToggleConversationCollapse: noop,
    onToggleSecondaryPanel: noop,
    onToggleWorkMode,
    renderHostedPanel: (panel) => panel,
    secondaryPanel: {
      activeTab: null,
      canUseGitUi: false,
      fileTabs: [],
      isBrowserTabActive: true,
      isOpen: isSecondaryPanelOpen,
      onCollapse: noop,
      onClose: noop,
      onFileTabReorder: noop,
      onOpenNewTab: noop,
      onPanelChange: noop,
      onPanelFocus: noop,
      renderBrowserDeck,
      showGitDiffTab: false,
    },
    surfaceArrangement: arrangement,
    timeline: {
      activeThinking: null,
      hasOlderTimelineRows: false,
      isLoadingOlderTimelineRows: false,
      isThreadTimelinePending: false,
      onLoadOlderRows: noop,
      resolveMentionLink: () => null,
      showOngoingIndicator: false,
      stopRequestedAt: null,
      threadId,
      threadRuntimeDisplayStatus: "idle",
      timelineError: false,
      timelineRows: [],
      unreadDividerAutoScroll: false,
      unreadDividerPlacement: null,
      workspaceRootPath: undefined,
    } as unknown as ThreadDetailSecondaryContentProps["timeline"],
  };
}

function renderThreadDetail(args: RenderThreadDetailArgs) {
  let renderArgs = args;
  const view = render(
    <CompactViewportOverrideProvider
      isCompactViewport={renderArgs.isCompactViewport}
    >
      <ThreadDetailTestPaneProvider
        isFocusedHosted={renderArgs.isFocusedHosted}
      >
        <ThreadDetailSecondaryContent
          {...createProps({
            arrangement: renderArgs.arrangement,
            hasPendingInteraction: renderArgs.hasPendingInteraction,
            isSecondaryPanelOpen: renderArgs.isSecondaryPanelOpen,
            isWorkMode: renderArgs.isWorkMode,
            onToggleWorkMode: renderArgs.onToggleWorkMode,
            renderBrowserDeck: renderArgs.renderBrowserDeck,
            threadId: renderArgs.threadId,
          })}
        />
      </ThreadDetailTestPaneProvider>
    </CompactViewportOverrideProvider>,
  );

  return {
    ...view,
    rerenderWith(nextArgs: Partial<RenderThreadDetailArgs>) {
      renderArgs = { ...renderArgs, ...nextArgs };
      view.rerender(
        <CompactViewportOverrideProvider
          isCompactViewport={renderArgs.isCompactViewport}
        >
          <ThreadDetailTestPaneProvider
            isFocusedHosted={renderArgs.isFocusedHosted}
          >
            <ThreadDetailSecondaryContent
              {...createProps({
                arrangement: renderArgs.arrangement,
                hasPendingInteraction: renderArgs.hasPendingInteraction,
                isSecondaryPanelOpen: renderArgs.isSecondaryPanelOpen,
                isWorkMode: renderArgs.isWorkMode,
                onToggleWorkMode: renderArgs.onToggleWorkMode,
                renderBrowserDeck: renderArgs.renderBrowserDeck,
                threadId: renderArgs.threadId,
              })}
            />
          </ThreadDetailTestPaneProvider>
        </CompactViewportOverrideProvider>,
      );
    },
  };
}

function expectBrowserDeckVisibility(canShowNativeBrowserView: boolean) {
  expect(
    screen
      .getByTestId("browser-deck")
      .getAttribute("data-can-show-native-browser-view"),
  ).toBe(String(canShowNativeBrowserView));
}

// Before the compact drawer settles, the whole secondary panel (deck
// included) stays unmounted so its mount cost cannot block the entrance
// animation; a skeleton fills the sheet instead.
function expectDrawerPanelNotRealized() {
  expect(screen.queryByTestId("browser-deck")).toBeNull();
}

function scheduleCompactDrawerSettleFrame() {
  const callback = drawerShellState.onContentAnimationEnd;
  if (callback === undefined) {
    throw new Error("ResponsiveDrawerShell did not receive animation callback");
  }
  act(() => {
    callback(true);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  drawerShellState.onContentAnimationEnd = undefined;
});

beforeEach(() => {
  publishedHostedPanel = null;
  vi.mocked(dispatchBrowserViewBoundsSync).mockReset();
});

describe("ThreadDetailSecondaryContent compact drawer settling", () => {
  it("keeps the standalone panel hide control in the panel toolbar", () => {
    renderThreadDetail({
      isCompactViewport: false,
      isSecondaryPanelOpen: true,
      renderBrowserDeck: createBrowserDeckRenderer(),
      threadId: "thread-1",
    });

    expect(
      screen
        .getByTestId("inline-secondary-panel")
        .getAttribute("data-inline-panel-toggle"),
    ).toBe("button");
  });

  it("places the hosted panel hide control at the outer edge of its own toolbar", () => {
    renderThreadDetail({
      isCompactViewport: false,
      isFocusedHosted: true,
      isSecondaryPanelOpen: true,
      renderBrowserDeck: createBrowserDeckRenderer(),
      threadId: "thread-1",
    });

    if (publishedHostedPanel === null) {
      throw new Error("Expected the focused pane to publish its panel model");
    }
    render(<>{publishedHostedPanel.panel}</>);
    expect(
      screen
        .getByTestId("inline-secondary-panel")
        .getAttribute("data-inline-panel-toggle"),
    ).toBe("button");
  });

  it("keeps the thread header inside the timeline column beside the side panel", () => {
    renderThreadDetail({
      isCompactViewport: false,
      isSecondaryPanelOpen: true,
      renderBrowserDeck: createBrowserDeckRenderer(),
      threadId: "thread-1",
    });

    const timelinePanel = screen.getByTestId("panel");
    const sidePanel = screen.getByTestId("inline-secondary-panel");
    const panelGroup = screen.getByTestId("panel-group");
    expect(timelinePanel.contains(screen.getByTestId("header"))).toBe(true);
    expect(timelinePanel.contains(sidePanel)).toBe(false);
    expect(panelGroup.contains(timelinePanel)).toBe(true);
    expect(panelGroup.contains(sidePanel)).toBe(true);
  });

  it("does not promote when a resource opens in Conversation mode", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const view = renderThreadDetail({
      arrangement: "conversation-primary",
      isCompactViewport: false,
      isSecondaryPanelOpen: false,
      isWorkMode: false,
      renderBrowserDeck: createBrowserDeckRenderer(),
      threadId: "thread-1",
    });

    expect(
      screen
        .getByTestId("panel")
        .closest("[data-thread-mode]")
        ?.getAttribute("data-thread-mode"),
    ).toBe("conversation");

    view.rerenderWith({ isSecondaryPanelOpen: true });

    expect(
      screen
        .getByTestId("panel")
        .closest("[data-thread-mode]")
        ?.getAttribute("data-thread-mode"),
    ).toBe("conversation");
    expect(screen.getByTestId("panel").style.order).toBe("1");
    expect(screen.getByTestId("inline-secondary-panel").style.order).toBe("3");
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("preserves real Thread region state and focus across Conversation and Work mode", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const view = renderThreadDetail({
      arrangement: "conversation-primary",
      isCompactViewport: false,
      isSecondaryPanelOpen: true,
      isWorkMode: false,
      renderBrowserDeck: createBrowserDeckRenderer(),
      threadId: "thread-1",
    });
    const conversation = screen
      .getByTestId("thread-timeline-pane")
      .closest('[data-thread-region="conversation"]');
    const workSurface = screen.getByTestId("inline-secondary-panel");
    const draft = screen.getByRole("textbox", { name: "Draft" });
    const timeline = screen.getByTestId("thread-timeline-pane");

    if (conversation === null) {
      throw new Error("Expected the stable conversation region");
    }
    fireEvent.change(draft, { target: { value: "edited draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Open preview" }));
    timeline.scrollTop = 240;
    draft.focus();

    view.rerenderWith({
      arrangement: "work-surface-primary",
      isWorkMode: true,
    });

    const preservedDraft = screen.getByRole("textbox", { name: "Draft" });
    expect(screen.getAllByTestId("thread-timeline-pane")).toHaveLength(1);
    expect(screen.getAllByTestId("inline-secondary-panel")).toHaveLength(1);
    expect(
      screen
        .getByTestId("thread-timeline-pane")
        .closest('[data-thread-region="conversation"]'),
    ).toBe(conversation);
    expect(screen.getByTestId("inline-secondary-panel")).toBe(workSurface);
    expect(preservedDraft).toBeInstanceOf(HTMLInputElement);
    if (!(preservedDraft instanceof HTMLInputElement)) {
      throw new Error("Expected the draft control to be an input");
    }
    expect(preservedDraft.value).toBe("edited draft");
    expect(screen.getByTestId("thread-timeline-pane").scrollTop).toBe(240);
    expect(screen.getByTestId("active-resource").textContent).toBe(
      "preview.pdf",
    );
    expect(document.activeElement).toBe(preservedDraft);
    expect(screen.getByTestId("panel").style.order).toBe("3");
    expect(screen.getByTestId("inline-secondary-panel").style.order).toBe("1");
    expect(
      screen
        .getByTestId("panel")
        .closest("[data-thread-mode]")
        ?.getAttribute("data-thread-mode"),
    ).toBe("work");
    expect(screen.getByTestId("header")).not.toBeNull();
    expect(screen.getByTestId("footer")).not.toBeNull();
    expect(conversation.contains(screen.getByTestId("header"))).toBe(true);
    expect(conversation.contains(screen.getByTestId("footer"))).toBe(true);
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();

    view.rerenderWith({
      arrangement: "conversation-primary",
      isWorkMode: false,
    });

    expect(
      screen
        .getByTestId("thread-timeline-pane")
        .closest('[data-thread-region="conversation"]'),
    ).toBe(conversation);
    expect(screen.getByTestId("inline-secondary-panel")).toBe(workSurface);
    expect(document.activeElement).toBe(preservedDraft);
    expect(
      screen
        .getByTestId("panel")
        .closest("[data-thread-mode]")
        ?.getAttribute("data-thread-mode"),
    ).toBe("conversation");
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("keeps conversation, work-surface host, and browser deck mounted while switching tabs in Work mode", () => {
    renderThreadDetail({
      arrangement: "work-surface-primary",
      isCompactViewport: false,
      isSecondaryPanelOpen: true,
      isWorkMode: true,
      renderBrowserDeck: createBrowserDeckRenderer(),
      threadId: "thread-1",
    });
    const conversation = screen
      .getByTestId("thread-timeline-pane")
      .closest('[data-thread-region="conversation"]');
    const workSurface = screen.getByTestId("inline-secondary-panel");
    const browserDeck = screen.getByTestId("browser-deck");

    if (conversation === null) {
      throw new Error("Expected the stable conversation region");
    }

    fireEvent.click(screen.getByRole("button", { name: "Open docs" }));
    fireEvent.click(screen.getByRole("button", { name: "Open preview" }));

    expect(screen.getByTestId("active-resource").textContent).toBe(
      "preview.pdf",
    );
    expect(
      screen
        .getByTestId("thread-timeline-pane")
        .closest('[data-thread-region="conversation"]'),
    ).toBe(conversation);
    expect(screen.getByTestId("inline-secondary-panel")).toBe(workSurface);
    expect(screen.getByTestId("browser-deck")).toBe(browserDeck);
  });

  it("hides and restores native browser readiness as hosted pane focus changes", () => {
    const order: string[] = [];
    const renderBrowserDeck = createBrowserDeckRenderer(order);
    const view = renderThreadDetail({
      isCompactViewport: false,
      isFocusedHosted: true,
      isSecondaryPanelOpen: true,
      renderBrowserDeck,
      threadId: "thread-1",
    });

    expect(renderBrowserDeck).toHaveBeenLastCalledWith({
      canShowNativeBrowserView: true,
    });
    view.rerenderWith({ isFocusedHosted: false });
    expect(renderBrowserDeck).toHaveBeenLastCalledWith({
      canShowNativeBrowserView: false,
    });
    view.rerenderWith({ isFocusedHosted: true });
    expect(renderBrowserDeck).toHaveBeenLastCalledWith({
      canShowNativeBrowserView: true,
    });
    expect(order.filter((entry) => entry.startsWith("render:"))).toEqual([
      "render:true",
      "render:false",
      "render:true",
    ]);
  });

  it("orders open-animation completion, rAF, bounds sync, and drawer settled true", () => {
    const order: string[] = [];
    const frames = installAnimationFrameQueue(order);
    vi.mocked(dispatchBrowserViewBoundsSync).mockImplementation(() => {
      order.push("dispatchBrowserViewBoundsSync");
    });
    const renderBrowserDeck = createBrowserDeckRenderer(order);

    renderThreadDetail({
      isCompactViewport: true,
      isSecondaryPanelOpen: true,
      renderBrowserDeck,
      threadId: "thread-1",
    });

    expectDrawerPanelNotRealized();

    order.push("animationEnd:true");
    scheduleCompactDrawerSettleFrame();

    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(dispatchBrowserViewBoundsSync).not.toHaveBeenCalled();
    expectDrawerPanelNotRealized();

    act(() => {
      frames.flushAll();
    });

    expectBrowserDeckVisibility(true);
    expect(order).toEqual([
      "render:false",
      "animationEnd:true",
      "requestAnimationFrame",
      "dispatchBrowserViewBoundsSync",
      "render:true",
    ]);
  });

  it("ignores close-animation completion without dispatching bounds sync", () => {
    const frames = installAnimationFrameQueue();
    const renderBrowserDeck = createBrowserDeckRenderer();

    renderThreadDetail({
      isCompactViewport: true,
      isSecondaryPanelOpen: true,
      renderBrowserDeck,
      threadId: "thread-1",
    });

    const callback = drawerShellState.onContentAnimationEnd;
    if (callback === undefined) {
      throw new Error(
        "ResponsiveDrawerShell did not receive animation callback",
      );
    }

    act(() => {
      callback(false);
    });

    expect(frames.requestAnimationFrame).not.toHaveBeenCalled();
    expect(dispatchBrowserViewBoundsSync).not.toHaveBeenCalled();
    expectDrawerPanelNotRealized();
  });

  it("does not schedule a stale open callback after the compact drawer closes", () => {
    const frames = installAnimationFrameQueue();
    const renderBrowserDeck = createBrowserDeckRenderer();
    const view = renderThreadDetail({
      isCompactViewport: true,
      isSecondaryPanelOpen: true,
      renderBrowserDeck,
      threadId: "thread-1",
    });

    view.rerenderWith({ isSecondaryPanelOpen: false });
    scheduleCompactDrawerSettleFrame();

    expect(frames.requestAnimationFrame).not.toHaveBeenCalled();
    expect(dispatchBrowserViewBoundsSync).not.toHaveBeenCalled();
    expectDrawerPanelNotRealized();
  });

  it("cancels a pending compact drawer settle rAF when the drawer closes", () => {
    const frames = installAnimationFrameQueue();
    const renderBrowserDeck = createBrowserDeckRenderer();
    const view = renderThreadDetail({
      isCompactViewport: true,
      isSecondaryPanelOpen: true,
      renderBrowserDeck,
      threadId: "thread-1",
    });

    scheduleCompactDrawerSettleFrame();
    expect(frames.size()).toBe(1);

    view.rerenderWith({ isSecondaryPanelOpen: false });
    expect(frames.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(frames.cancelAnimationFrame).toHaveBeenCalledWith(1);

    act(() => {
      frames.flushAll();
    });

    expect(dispatchBrowserViewBoundsSync).not.toHaveBeenCalled();
    expectDrawerPanelNotRealized();
  });

  it("cancels a pending compact drawer settle rAF when the thread changes", () => {
    const frames = installAnimationFrameQueue();
    const renderBrowserDeck = createBrowserDeckRenderer();
    const view = renderThreadDetail({
      isCompactViewport: true,
      isSecondaryPanelOpen: true,
      renderBrowserDeck,
      threadId: "thread-1",
    });

    scheduleCompactDrawerSettleFrame();
    expect(frames.size()).toBe(1);

    view.rerenderWith({ threadId: "thread-2" });
    expect(frames.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(frames.cancelAnimationFrame).toHaveBeenCalledWith(1);

    act(() => {
      frames.flushAll();
    });

    expect(dispatchBrowserViewBoundsSync).not.toHaveBeenCalled();
    expectDrawerPanelNotRealized();
  });

  it("cancels a pending compact drawer settle rAF on compact-to-wide transition", () => {
    const frames = installAnimationFrameQueue();
    const renderBrowserDeck = createBrowserDeckRenderer();
    const view = renderThreadDetail({
      isCompactViewport: true,
      isSecondaryPanelOpen: true,
      renderBrowserDeck,
      threadId: "thread-1",
    });

    scheduleCompactDrawerSettleFrame();
    expect(frames.size()).toBe(1);

    view.rerenderWith({ isCompactViewport: false });
    expect(frames.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(frames.cancelAnimationFrame).toHaveBeenCalledWith(1);

    act(() => {
      frames.flushAll();
    });

    expect(dispatchBrowserViewBoundsSync).not.toHaveBeenCalled();
    expectBrowserDeckVisibility(true);
  });

  it("cancels a pending compact drawer settle rAF on unmount", () => {
    const frames = installAnimationFrameQueue();
    const renderBrowserDeck = createBrowserDeckRenderer();
    const view = renderThreadDetail({
      isCompactViewport: true,
      isSecondaryPanelOpen: true,
      renderBrowserDeck,
      threadId: "thread-1",
    });

    scheduleCompactDrawerSettleFrame();
    expect(frames.size()).toBe(1);

    view.unmount();
    expect(frames.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(frames.cancelAnimationFrame).toHaveBeenCalledWith(1);

    act(() => {
      frames.flushAll();
    });

    expect(dispatchBrowserViewBoundsSync).not.toHaveBeenCalled();
  });

  it("passes compact opening and wide layout visibility values to the browser deck render prop", () => {
    const frames = installAnimationFrameQueue();
    vi.mocked(dispatchBrowserViewBoundsSync).mockImplementation(() => {});
    const compactRenderBrowserDeck = createBrowserDeckRenderer();

    renderThreadDetail({
      isCompactViewport: true,
      isSecondaryPanelOpen: true,
      renderBrowserDeck: compactRenderBrowserDeck,
      threadId: "thread-1",
    });

    expect(compactRenderBrowserDeck).toHaveBeenLastCalledWith({
      canShowNativeBrowserView: false,
    });
    scheduleCompactDrawerSettleFrame();
    act(() => {
      frames.flushAll();
    });
    expect(compactRenderBrowserDeck).toHaveBeenLastCalledWith({
      canShowNativeBrowserView: true,
    });

    cleanup();

    const wideRenderBrowserDeck = createBrowserDeckRenderer();
    const wideView = renderThreadDetail({
      isCompactViewport: false,
      isSecondaryPanelOpen: false,
      renderBrowserDeck: wideRenderBrowserDeck,
      threadId: "thread-1",
    });

    expect(wideRenderBrowserDeck).toHaveBeenLastCalledWith({
      canShowNativeBrowserView: false,
    });

    wideView.rerenderWith({ isSecondaryPanelOpen: true });

    expect(wideRenderBrowserDeck).toHaveBeenLastCalledWith({
      canShowNativeBrowserView: true,
    });
    expect(dispatchBrowserViewBoundsSync).toHaveBeenCalledTimes(1);
  });
});

describe("ThreadDetailSecondaryContent compact Work mode", () => {
  function renderCompactWorkMode(
    overrides: Partial<RenderThreadDetailArgs> = {},
  ) {
    return renderThreadDetail({
      arrangement: "work-surface-primary",
      isCompactViewport: true,
      isSecondaryPanelOpen: true,
      isWorkMode: true,
      renderBrowserDeck: createBrowserDeckRenderer(),
      threadId: "thread-1",
      ...overrides,
    });
  }

  function drawerShell() {
    return screen.getByTestId("responsive-drawer-shell");
  }

  it("inverts the drawer: the work surface takes the page and the conversation takes the drawer", () => {
    renderCompactWorkMode();

    const workSurface = screen.getByTestId("inline-secondary-panel");
    // No PanelGroup on the page: there is nothing beside the work surface to
    // resize against, so it must not ask for a resizable Panel wrapper either.
    expect(screen.queryByTestId("panel-group")).toBeNull();
    expect(screen.queryByTestId("panel")).toBeNull();
    expect(workSurface.getAttribute("data-without-resizable-panel")).toBe(
      "true",
    );
    expect(screen.queryByTestId("drawer-secondary-panel")).toBeNull();
    expect(drawerShell().contains(workSurface)).toBe(false);

    // The complete conversation — header, timeline, and composer footer — is
    // what the drawer now holds, and it is closed until the user asks for it.
    const conversation = screen
      .getByTestId("thread-timeline-pane")
      .closest('[data-thread-region="conversation"]');
    if (conversation === null) {
      throw new Error("Expected the stable conversation region");
    }
    expect(drawerShell().contains(conversation)).toBe(true);
    expect(conversation.contains(screen.getByTestId("header"))).toBe(true);
    expect(conversation.contains(screen.getByTestId("footer"))).toBe(true);
    expect(drawerShell().getAttribute("data-open")).toBe("false");
    expect(drawerShell().getAttribute("data-sr-label")).toBe("Conversation");
    expect(
      workSurface
        .closest("[data-thread-mode]")
        ?.getAttribute("data-thread-mode"),
    ).toBe("work");
  });

  it("opens and closes the conversation drawer without leaving Work mode", () => {
    renderCompactWorkMode();

    const control = screen.getByRole("button", {
      name: CONVERSATION_DRAWER_CONTROL_LABEL,
    });
    expect(control.getAttribute("aria-expanded")).toBe("false");
    expect(control.getAttribute("aria-haspopup")).toBe("dialog");

    fireEvent.click(control);

    expect(drawerShell().getAttribute("data-open")).toBe("true");
    expect(
      screen
        .getByRole("button", { name: CONVERSATION_DRAWER_CONTROL_LABEL })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen
        .getByTestId("inline-secondary-panel")
        .closest("[data-thread-mode]")
        ?.getAttribute("data-thread-mode"),
    ).toBe("work");

    // Dismissing the sheet itself (swipe/scrim/Escape all land on onOpenChange)
    // must close only the drawer — the work surface keeps the page.
    fireEvent.click(screen.getByRole("button", { name: "Dismiss drawer" }));

    expect(drawerShell().getAttribute("data-open")).toBe("false");
    expect(screen.getByTestId("inline-secondary-panel")).not.toBeNull();
    expect(screen.queryByTestId("panel-group")).toBeNull();
    expect(
      screen
        .getByTestId("inline-secondary-panel")
        .closest("[data-thread-mode]")
        ?.getAttribute("data-thread-mode"),
    ).toBe("work");
    expect(
      screen
        .getByRole("button", { name: CONVERSATION_DRAWER_CONTROL_LABEL })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("indicates a waiting approval or question on the closed drawer control without opening it", () => {
    const view = renderCompactWorkMode({ hasPendingInteraction: false });

    expect(
      screen.queryByTestId("thread-conversation-pending-indicator"),
    ).toBeNull();

    view.rerenderWith({ hasPendingInteraction: true });

    const indicator = screen.getByTestId(
      "thread-conversation-pending-indicator",
    );
    expect(indicator.getAttribute("role")).toBe("status");
    expect(indicator.textContent).toBe(CONVERSATION_PENDING_INDICATOR_LABEL);
    // The control points at its own pane's indicator, so a second pane in the
    // same document cannot capture the reference.
    expect(indicator.id).toBe(
      resolveConversationPendingIndicatorElementId("main"),
    );
    expect(
      screen
        .getByTestId("thread-conversation-drawer-toggle")
        .getAttribute("aria-describedby"),
    ).toBe(indicator.id);
    // The indicator is the whole response: the drawer never opens on its own.
    expect(drawerShell().getAttribute("data-open")).toBe("false");

    // It persists while the interaction is unresolved, including once the user
    // has opened and dismissed the drawer.
    fireEvent.click(
      screen.getByRole("button", { name: CONVERSATION_DRAWER_CONTROL_LABEL }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss drawer" }));
    expect(
      screen.getByTestId("thread-conversation-pending-indicator").textContent,
    ).toBe(CONVERSATION_PENDING_INDICATOR_LABEL);
    expect(drawerShell().getAttribute("data-open")).toBe("false");
  });

  it("keeps keyboard focus on the Work mode control across promotion and restoration", () => {
    const frames = installAnimationFrameQueue();
    const view = renderThreadDetail({
      isCompactViewport: true,
      isSecondaryPanelOpen: true,
      isWorkMode: false,
      renderBrowserDeck: createBrowserDeckRenderer(),
      threadId: "thread-1",
    });
    // The compact panel drawer is where the user enters Work mode; its content
    // mounts once the sheet has settled and the settle frame has run.
    scheduleCompactDrawerSettleFrame();
    act(() => {
      frames.flushAll();
    });

    const enterControl = screen.getByTestId("thread-work-mode-toggle");
    expect(enterControl.getAttribute("aria-label")).toBe("Enter Work mode");
    expect(enterControl.getAttribute("aria-pressed")).toBe("false");
    enterControl.focus();
    expect(document.activeElement).toBe(enterControl);

    view.rerenderWith({
      arrangement: "work-surface-primary",
      isWorkMode: true,
    });

    // Promotion moved the surface out of the drawer portal and onto the page,
    // remounting the control. Focus follows it rather than falling to <body>.
    const restoreControl = screen.getByTestId("thread-work-mode-toggle");
    expect(restoreControl).not.toBe(enterControl);
    expect(restoreControl.getAttribute("aria-label")).toBe(
      "Restore Conversation",
    );
    expect(restoreControl.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(restoreControl);
    // Both states are the same control, so the id is stable across the swap.
    expect(restoreControl.id).toBe(enterControl.id);
    expect(restoreControl.id).not.toBe("");

    view.rerenderWith({
      arrangement: "conversation-primary",
      isWorkMode: false,
    });

    const restoredEnterControl = screen.getByTestId("thread-work-mode-toggle");
    expect(restoredEnterControl.getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(restoredEnterControl);
  });

  it("leaves focus alone when the user has already moved on", () => {
    const view = renderCompactWorkMode();
    const drawerControl = screen.getByRole("button", {
      name: CONVERSATION_DRAWER_CONTROL_LABEL,
    });
    drawerControl.focus();

    view.rerenderWith({ hasPendingInteraction: true });

    expect(document.activeElement).toBe(drawerControl);
  });

  it("closes the conversation drawer when Work mode ends", () => {
    const view = renderCompactWorkMode();
    fireEvent.click(
      screen.getByRole("button", { name: CONVERSATION_DRAWER_CONTROL_LABEL }),
    );
    expect(drawerShell().getAttribute("data-open")).toBe("true");

    view.rerenderWith({
      arrangement: "conversation-primary",
      isWorkMode: false,
    });

    // Back to the ordinary compact layout: the one drawer on the page is the
    // panel drawer again, closed, with the conversation on the page.
    expect(
      screen.queryByTestId("thread-conversation-drawer-toggle"),
    ).toBeNull();
    expect(screen.getByTestId("panel-group")).not.toBeNull();

    view.rerenderWith({
      arrangement: "work-surface-primary",
      isWorkMode: true,
    });

    // Re-entering does not restore the previous open state, and nothing opens
    // the drawer except its own control.
    expect(drawerShell().getAttribute("data-open")).toBe("false");
  });

  // The drawer half of the reduced-motion requirement cannot be asserted here:
  // this suite mocks the drawer shell, and the suppression lives in vaul's own
  // markup. It is covered against the real drawer in
  // `src/components/ui/drawer.reducedMotion.test.tsx`.
  it("suppresses the conversation collapse transition under reduced motion", () => {
    renderCompactWorkMode();

    const conversation = screen
      .getByTestId("thread-timeline-pane")
      .closest('[data-thread-region="conversation"]');
    expect(conversation?.className).toContain("motion-reduce:transition-none");
  });
});

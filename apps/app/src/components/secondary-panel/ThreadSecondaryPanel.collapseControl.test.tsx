// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelGroup } from "react-resizable-panels";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import { createThreadInfoFixedPanelTab } from "@/lib/fixed-panel-tabs-state";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import {
  CONVERSATION_DRAWER_CONTROL_LABEL,
  CONVERSATION_PENDING_INDICATOR_LABEL,
} from "./panelToggleControlState";
import { ThreadSecondaryPanel } from "./ThreadSecondaryPanel";

afterEach(cleanup);

const noop = () => {};

/**
 * A native button is activated from the keyboard by Enter or Space, which the
 * browser delivers as a click event with `detail === 0`. Pointer clicks carry a
 * non-zero detail, so this distinguishes keyboard-only operation.
 */
function pressWithKeyboard(control: HTMLElement) {
  control.focus();
  expect(document.activeElement).toBe(control);
  expect(control.tagName).toBe("BUTTON");
  expect(control.tabIndex).toBeGreaterThanOrEqual(0);
  fireEvent.click(control, { detail: 0 });
}

function renderPanel(args: {
  canEnterWorkMode?: boolean;
  conversationDrawer?: {
    hasPendingInteraction: boolean;
    isOpen: boolean;
    onToggle: () => void;
    pendingIndicatorId: string;
  };
  isConversationCollapsed: boolean;
  onToggleConversationCollapse: () => void;
  isWorkMode?: boolean;
  onToggleWorkMode?: () => void;
  renderAsDrawer?: boolean;
  withoutResizablePanel?: boolean;
  workModeToggleId?: string;
}) {
  const { wrapper: Wrapper } = createQueryClientTestHarness();
  return render(
    <Wrapper>
      <TooltipProvider>
        <PanelGroup direction="horizontal">
          <ThreadSecondaryPanel
            activeTab={createThreadInfoFixedPanelTab()}
            canUseGitUi={false}
            isOpen
            metadataContent={null}
            onClose={noop}
            onCollapse={noop}
            onFileTabReorder={noop}
            onOpenNewTab={noop}
            onPanelChange={noop}
            onPanelFocus={noop}
            renderAsDrawer={false}
            {...args}
          />
        </PanelGroup>
      </TooltipProvider>
    </Wrapper>,
  );
}

describe("ThreadSecondaryPanel resize handle", () => {
  it("uses a real 12px hit target centered over the resize seam", () => {
    const view = renderPanel({
      isConversationCollapsed: false,
      onToggleConversationCollapse: noop,
    });

    const handle = view.getByRole("separator", {
      name: "Resize thread and right panel",
    });
    const hitTarget = handle.querySelector("[data-panel-resize-hit-target]");

    expect(handle.className.split(/\s+/u)).toContain("z-[25]");
    expect(hitTarget).not.toBeNull();
    expect(hitTarget?.className.split(/\s+/u)).toEqual(
      expect.arrayContaining([
        "left-1/2",
        "z-10",
        "w-3",
        "-translate-x-1/2",
        "cursor-col-resize",
      ]),
    );
  });
});

describe("ThreadSecondaryPanel Work mode control", () => {
  it("keeps Enter Work mode before Hide right panel in the trailing toolbar", () => {
    const view = renderPanel({
      isConversationCollapsed: false,
      onToggleConversationCollapse: noop,
      onToggleWorkMode: noop,
    });

    const workModeControl = view.getByRole("button", {
      name: "Enter Work mode",
    });
    const hideControl = view.getByRole("button", {
      name: "Hide right panel",
    });
    expect(
      workModeControl.compareDocumentPosition(hideControl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("enters Work mode from Conversation mode", () => {
    const onToggleWorkMode = vi.fn();
    const view = renderPanel({
      isConversationCollapsed: false,
      onToggleConversationCollapse: noop,
      onToggleWorkMode,
    });

    const control = view.getByRole("button", { name: "Enter Work mode" });
    expect(control.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(control);
    expect(onToggleWorkMode).toHaveBeenCalledTimes(1);
  });

  it("disables Enter Work mode when no eligible surface is open", () => {
    const onToggleWorkMode = vi.fn();
    const view = renderPanel({
      canEnterWorkMode: false,
      isConversationCollapsed: false,
      onToggleConversationCollapse: noop,
      onToggleWorkMode,
    });

    const control = view.getByRole("button", { name: "Enter Work mode" });
    expect(control).toHaveProperty("disabled", true);

    fireEvent.click(control);
    expect(onToggleWorkMode).not.toHaveBeenCalled();
  });

  it("renames the hide control while the work surface is primary", () => {
    const view = renderPanel({
      isConversationCollapsed: false,
      isWorkMode: true,
      onToggleConversationCollapse: noop,
      onToggleWorkMode: noop,
    });

    expect(
      view.getByRole("button", { name: "Hide work surface" }),
    ).not.toBeNull();
    expect(view.queryByRole("button", { name: "Hide right panel" })).toBeNull();
    expect(
      view.getByRole("toolbar", { name: "Work surface views" }),
    ).not.toBeNull();
  });

  it("restores Conversation mode from the same slot", () => {
    const onToggleWorkMode = vi.fn();
    const view = renderPanel({
      isConversationCollapsed: false,
      isWorkMode: true,
      onToggleConversationCollapse: noop,
      onToggleWorkMode,
    });

    const control = view.getByRole("button", { name: "Restore Conversation" });
    expect(control.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(control);
    expect(onToggleWorkMode).toHaveBeenCalledTimes(1);
  });

  it("carries the layout owner's id so focus can survive the enter/restore swap", () => {
    const view = renderPanel({
      isConversationCollapsed: false,
      onToggleConversationCollapse: noop,
      onToggleWorkMode: noop,
      workModeToggleId: "thread-work-mode-toggle-pane-1",
    });

    expect(view.getByRole("button", { name: "Enter Work mode" }).id).toBe(
      "thread-work-mode-toggle-pane-1",
    );
  });

  /**
   * The compact drawer holds the work surface before Work mode promotes it to
   * the page, so the Work mode control is the only way in — the conversation
   * collapse fallback is wide-layout-only and stays out of the drawer.
   */
  it("keeps the Work mode control in the compact drawer and nothing in its place", () => {
    const offeredView = renderPanel({
      isConversationCollapsed: false,
      onToggleConversationCollapse: noop,
      onToggleWorkMode: noop,
      renderAsDrawer: true,
    });
    expect(
      offeredView.getByRole("button", { name: "Enter Work mode" }),
    ).not.toBeNull();

    cleanup();

    const withoutWorkModeView = renderPanel({
      isConversationCollapsed: false,
      onToggleConversationCollapse: noop,
      renderAsDrawer: true,
    });
    expect(
      withoutWorkModeView.queryByRole("button", { name: "Enter Work mode" }),
    ).toBeNull();
    expect(
      withoutWorkModeView.queryByRole("button", { name: "Hide Conversation" }),
    ).toBeNull();
    expect(
      withoutWorkModeView.queryByRole("button", { name: "Show Conversation" }),
    ).toBeNull();
  });

  it("operates from the keyboard in both states", () => {
    const onEnter = vi.fn();
    const enterView = renderPanel({
      isConversationCollapsed: false,
      onToggleConversationCollapse: noop,
      onToggleWorkMode: onEnter,
    });
    pressWithKeyboard(
      enterView.getByRole("button", { name: "Enter Work mode" }),
    );
    expect(onEnter).toHaveBeenCalledTimes(1);

    cleanup();

    const onRestore = vi.fn();
    const restoreView = renderPanel({
      isConversationCollapsed: false,
      isWorkMode: true,
      onToggleConversationCollapse: noop,
      onToggleWorkMode: onRestore,
    });
    pressWithKeyboard(
      restoreView.getByRole("button", { name: "Restore Conversation" }),
    );
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});

// Compact Work mode inverts the drawer: the work surface takes the page and
// this control is the only way back to the conversation.
describe("ThreadSecondaryPanel conversation drawer control", () => {
  function renderWithDrawer(
    drawer: Partial<{
      hasPendingInteraction: boolean;
      isOpen: boolean;
      onToggle: () => void;
      pendingIndicatorId: string;
    }> = {},
  ) {
    return renderPanel({
      conversationDrawer: {
        hasPendingInteraction: false,
        isOpen: false,
        onToggle: noop,
        pendingIndicatorId: "thread-conversation-pending-indicator-test-pane",
        ...drawer,
      },
      isConversationCollapsed: false,
      isWorkMode: true,
      onToggleConversationCollapse: noop,
      onToggleWorkMode: noop,
      withoutResizablePanel: true,
    });
  }

  it("names the drawer once and carries its open state separately", () => {
    const closedView = renderWithDrawer({ isOpen: false });
    const closed = closedView.getByRole("button", {
      name: CONVERSATION_DRAWER_CONTROL_LABEL,
    });
    expect(closed.getAttribute("aria-expanded")).toBe("false");
    expect(closed.getAttribute("aria-haspopup")).toBe("dialog");

    cleanup();

    const openView = renderWithDrawer({ isOpen: true });
    const open = openView.getByRole("button", {
      name: CONVERSATION_DRAWER_CONTROL_LABEL,
    });
    // The name is stable across states; aria-expanded alone reports the change.
    expect(open.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens from the keyboard", () => {
    const onToggle = vi.fn();
    const view = renderWithDrawer({ onToggle });

    pressWithKeyboard(
      view.getByRole("button", { name: CONVERSATION_DRAWER_CONTROL_LABEL }),
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("describes the closed control with the waiting approval or question", () => {
    const quietView = renderWithDrawer({ hasPendingInteraction: false });
    expect(quietView.queryByRole("status")).toBeNull();
    expect(
      quietView
        .getByRole("button", { name: CONVERSATION_DRAWER_CONTROL_LABEL })
        .getAttribute("aria-describedby"),
    ).toBeNull();

    cleanup();

    const pendingView = renderWithDrawer({
      hasPendingInteraction: true,
      isOpen: false,
    });
    const control = pendingView.getByRole("button", {
      name: CONVERSATION_DRAWER_CONTROL_LABEL,
    });
    const describedBy = control.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();

    const indicator = pendingView.getByRole("status");
    expect(indicator.id).toBe(describedBy);
    expect(indicator.textContent).toBe(CONVERSATION_PENDING_INDICATOR_LABEL);
    // Purely an indication: the control stays closed and keeps its own name.
    expect(control.getAttribute("aria-expanded")).toBe("false");
  });

  it("stays out of the panel toolbar outside compact Work mode", () => {
    const view = renderPanel({
      isConversationCollapsed: false,
      isWorkMode: true,
      onToggleConversationCollapse: noop,
      onToggleWorkMode: noop,
    });

    expect(
      view.queryByRole("button", { name: CONVERSATION_DRAWER_CONTROL_LABEL }),
    ).toBeNull();
    expect(view.queryByRole("status")).toBeNull();
  });
});

// Hosted split panes whose Thread has no eligible work surface keep the
// resource-only conversation collapse.
describe("ThreadSecondaryPanel conversation collapse control", () => {
  it("keeps Hide Conversation before Hide right panel in the trailing toolbar", () => {
    const view = renderPanel({
      isConversationCollapsed: false,
      onToggleConversationCollapse: noop,
    });

    const collapseControl = view.getByRole("button", {
      name: "Hide Conversation",
    });
    const hideControl = view.getByRole("button", {
      name: "Hide right panel",
    });
    expect(
      collapseControl.compareDocumentPosition(hideControl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("expands the panel while the conversation is shown", () => {
    const onToggleConversationCollapse = vi.fn();
    const view = renderPanel({
      isConversationCollapsed: false,
      onToggleConversationCollapse,
    });

    const control = view.getByRole("button", { name: "Hide Conversation" });
    expect(control.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(control);
    expect(onToggleConversationCollapse).toHaveBeenCalledTimes(1);
  });

  it("restores the conversation from the same slot while it is collapsed", () => {
    const onToggleConversationCollapse = vi.fn();
    const view = renderPanel({
      isConversationCollapsed: true,
      onToggleConversationCollapse,
    });

    const control = view.getByRole("button", { name: "Show Conversation" });
    expect(control.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(control);
    expect(onToggleConversationCollapse).toHaveBeenCalledTimes(1);
  });
});

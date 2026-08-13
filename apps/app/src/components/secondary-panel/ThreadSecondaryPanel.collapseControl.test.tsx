// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelGroup } from "react-resizable-panels";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import { createThreadInfoFixedPanelTab } from "@/lib/fixed-panel-tabs-state";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { ThreadSecondaryPanel } from "./ThreadSecondaryPanel";

afterEach(cleanup);

const noop = () => {};

function renderPanel(args: {
  isConversationCollapsed: boolean;
  onToggleConversationCollapse: () => void;
  isWorkMode?: boolean;
  onToggleWorkMode?: () => void;
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
});

// Hosted split panes still use resource-only full screen until BB-6.
describe("ThreadSecondaryPanel full-screen control", () => {
  it("keeps Full Screen before Hide right panel in the trailing toolbar", () => {
    const view = renderPanel({
      isConversationCollapsed: false,
      onToggleConversationCollapse: noop,
    });

    const fullScreenControl = view.getByRole("button", {
      name: "Full Screen",
    });
    const hideControl = view.getByRole("button", {
      name: "Hide right panel",
    });
    expect(
      fullScreenControl.compareDocumentPosition(hideControl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("expands the panel while the conversation is shown", () => {
    const onToggleConversationCollapse = vi.fn();
    const view = renderPanel({
      isConversationCollapsed: false,
      onToggleConversationCollapse,
    });

    const control = view.getByRole("button", { name: "Full Screen" });
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

    const control = view.getByRole("button", { name: "Exit Full Screen" });
    expect(control.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(control);
    expect(onToggleConversationCollapse).toHaveBeenCalledTimes(1);
  });
});

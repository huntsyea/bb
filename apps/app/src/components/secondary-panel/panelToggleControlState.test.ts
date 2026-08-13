import { describe, expect, it, vi } from "vitest";
import {
  resolveConversationCollapseControl,
  resolveShowPanelControl,
  resolveWorkModeControl,
} from "./panelToggleControlState";

describe("resolveShowPanelControl", () => {
  it("opens the panel and reads as a closed disclosure", () => {
    const onToggleSecondaryPanel = vi.fn();
    const state = resolveShowPanelControl({ onToggleSecondaryPanel });

    expect(state.action).toBe("show-panel");
    expect(state.label).toBe("Show right panel");
    expect(state.isPressed).toBe(false);
    // The recognizable panel icon reads as "open the right side panel".
    expect(state.iconName).toBe("PanelRight");

    state.onClick();
    expect(onToggleSecondaryPanel).toHaveBeenCalledTimes(1);
  });
});

describe("resolveWorkModeControl", () => {
  it("enters Work mode from Conversation mode", () => {
    const onToggleWorkMode = vi.fn();
    const state = resolveWorkModeControl({
      isWorkMode: false,
      onToggleWorkMode,
    });

    expect(state.action).toBe("enter-work-mode");
    expect(state.label).toBe("Enter Work mode");
    expect(state.isPressed).toBe(false);
    expect(state.iconName).toBe("Maximize2");

    state.onClick();
    expect(onToggleWorkMode).toHaveBeenCalledTimes(1);
  });

  it("restores Conversation mode from the same control", () => {
    const onToggleWorkMode = vi.fn();
    const state = resolveWorkModeControl({
      isWorkMode: true,
      onToggleWorkMode,
    });

    expect(state.action).toBe("restore-conversation");
    expect(state.label).toBe("Restore Conversation");
    expect(state.isPressed).toBe(true);
    expect(state.iconName).toBe("Minimize2");

    state.onClick();
    expect(onToggleWorkMode).toHaveBeenCalledTimes(1);
  });
});

describe("resolveConversationCollapseControl", () => {
  it("collapses the conversation when it is shown", () => {
    const onToggleConversationCollapse = vi.fn();
    const state = resolveConversationCollapseControl({
      isConversationCollapsed: false,
      onToggleConversationCollapse,
    });

    expect(state.action).toBe("enter-full-screen");
    expect(state.label).toBe("Full Screen");
    expect(state.isPressed).toBe(false);
    expect(state.iconName).toBe("Maximize2");

    state.onClick();
    expect(onToggleConversationCollapse).toHaveBeenCalledTimes(1);
  });

  it("restores the conversation when it is collapsed", () => {
    const onToggleConversationCollapse = vi.fn();
    const state = resolveConversationCollapseControl({
      isConversationCollapsed: true,
      onToggleConversationCollapse,
    });

    expect(state.action).toBe("exit-full-screen");
    expect(state.label).toBe("Exit Full Screen");
    expect(state.isPressed).toBe(true);
    expect(state.iconName).toBe("Minimize2");

    state.onClick();
    expect(onToggleConversationCollapse).toHaveBeenCalledTimes(1);
  });
});

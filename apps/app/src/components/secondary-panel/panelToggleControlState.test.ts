import { describe, expect, it, vi } from "vitest";
import {
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
    expect(state.disabled).toBe(false);

    state.onClick();
    expect(onToggleWorkMode).toHaveBeenCalledTimes(1);
  });

  it("disables Enter Work mode when no eligible surface is open", () => {
    const onToggleWorkMode = vi.fn();
    const state = resolveWorkModeControl({
      canEnterWorkMode: false,
      isWorkMode: false,
      onToggleWorkMode,
    });

    expect(state.action).toBe("enter-work-mode");
    expect(state.disabled).toBe(true);
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


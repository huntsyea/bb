import { describe, expect, it } from "vitest";
import {
  canEnterThreadWorkMode,
  resolveThreadSurfaceArrangement,
  resolveThreadWorkModeLayoutSizes,
  toggleThreadPresentationMode,
} from "./threadWorkMode";

describe("threadWorkMode", () => {
  it("rearranges the existing surfaces instead of collapsing conversation", () => {
    expect(resolveThreadSurfaceArrangement("conversation")).toBe(
      "conversation-primary",
    );
    expect(resolveThreadSurfaceArrangement("work")).toBe(
      "work-surface-primary",
    );
    expect(toggleThreadPresentationMode("conversation")).toBe("work");
    expect(toggleThreadPresentationMode("work")).toBe("conversation");
  });

  it("never enters Work mode from an ordinary resource open", () => {
    expect(
      canEnterThreadWorkMode({
        isCompactViewport: false,
        isSecondaryPanelOpen: true,
        isStandaloneLayout: true,
      }),
    ).toBe(true);
    expect(
      canEnterThreadWorkMode({
        isCompactViewport: false,
        isSecondaryPanelOpen: false,
        isStandaloneLayout: true,
      }),
    ).toBe(false);
    expect(
      canEnterThreadWorkMode({
        isCompactViewport: true,
        isSecondaryPanelOpen: true,
        isStandaloneLayout: true,
      }),
    ).toBe(false);
    expect(
      canEnterThreadWorkMode({
        isCompactViewport: false,
        isSecondaryPanelOpen: true,
        isStandaloneLayout: false,
      }),
    ).toBe(false);
  });

  it("keeps independent rail and secondary-panel widths", () => {
    expect(
      resolveThreadWorkModeLayoutSizes({
        isWorkMode: false,
        isSecondaryPanelOpen: true,
        conversationRailWidthPercent: 36,
        secondaryPanelWidthPercent: 50,
      }),
    ).toEqual({
      conversationSizePercent: 50,
      workSurfaceSizePercent: 50,
    });
    expect(
      resolveThreadWorkModeLayoutSizes({
        isWorkMode: true,
        isSecondaryPanelOpen: true,
        conversationRailWidthPercent: 36,
        secondaryPanelWidthPercent: 50,
      }),
    ).toEqual({
      conversationSizePercent: 36,
      workSurfaceSizePercent: 64,
    });
  });
});

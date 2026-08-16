import { describe, expect, it } from "vitest";
import {
  CONVERSATION_RAIL_MAX_SIZE_PERCENT,
  CONVERSATION_RAIL_MIN_SIZE_PERCENT,
  DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT,
  canEnterThreadWorkMode,
  canRequestThreadWorkMode,
  constrainConversationRailWidthPercent,
  resolveConversationRailWidthUpdate,
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
        hasEligibleWorkSurface: true,
        isCompactViewport: false,
        isMaximizedPane: false,
        isSecondaryPanelOpen: true,
        isStandaloneLayout: true,
      }),
    ).toBe(true);
    expect(
      canEnterThreadWorkMode({
        hasEligibleWorkSurface: false,
        isCompactViewport: false,
        isMaximizedPane: false,
        isSecondaryPanelOpen: true,
        isStandaloneLayout: true,
      }),
    ).toBe(false);
    expect(
      canEnterThreadWorkMode({
        hasEligibleWorkSurface: true,
        isCompactViewport: false,
        isMaximizedPane: false,
        isSecondaryPanelOpen: false,
        isStandaloneLayout: true,
      }),
    ).toBe(false);
    expect(
      canEnterThreadWorkMode({
        hasEligibleWorkSurface: true,
        isCompactViewport: true,
        isMaximizedPane: false,
        isSecondaryPanelOpen: true,
        isStandaloneLayout: true,
      }),
    ).toBe(false);
    expect(
      canEnterThreadWorkMode({
        hasEligibleWorkSurface: true,
        isCompactViewport: false,
        isMaximizedPane: false,
        isSecondaryPanelOpen: true,
        isStandaloneLayout: false,
      }),
    ).toBe(false);
  });

  it("lets a hosted pane render Work mode only once it holds the workspace", () => {
    const hostedPane = {
      hasEligibleWorkSurface: true,
      isCompactViewport: false,
      isSecondaryPanelOpen: true,
      isStandaloneLayout: false,
    };
    // The offer comes first: entering Work mode is what maximizes the pane, so
    // gating the offer on the maximization would make it unreachable.
    expect(canRequestThreadWorkMode(hostedPane)).toBe(true);
    expect(
      canEnterThreadWorkMode({ ...hostedPane, isMaximizedPane: false }),
    ).toBe(false);
    expect(
      canEnterThreadWorkMode({ ...hostedPane, isMaximizedPane: true }),
    ).toBe(true);
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
        conversationRailWidthPercent: DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT,
        secondaryPanelWidthPercent: 50,
      }),
    ).toEqual({
      conversationSizePercent: DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT,
      workSurfaceSizePercent: 100 - DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT,
    });
  });

  it("records a rail width only during a user drag in Work mode", () => {
    expect(
      resolveConversationRailWidthUpdate({
        isWorkMode: true,
        isUserResizing: true,
        sizePercent: 42,
      }),
    ).toBe(42);
    expect(
      resolveConversationRailWidthUpdate({
        isWorkMode: true,
        isUserResizing: false,
        sizePercent: 42,
      }),
    ).toBeNull();
    expect(
      resolveConversationRailWidthUpdate({
        isWorkMode: false,
        isUserResizing: true,
        sizePercent: 42,
      }),
    ).toBeNull();
  });

  it("constrains the conversation rail at render time without changing the secondary-panel width", () => {
    expect(constrainConversationRailWidthPercent(10)).toBe(
      CONVERSATION_RAIL_MIN_SIZE_PERCENT,
    );
    expect(constrainConversationRailWidthPercent(80)).toBe(
      CONVERSATION_RAIL_MAX_SIZE_PERCENT,
    );
    expect(
      resolveThreadWorkModeLayoutSizes({
        isWorkMode: true,
        isSecondaryPanelOpen: true,
        conversationRailWidthPercent: 12,
        secondaryPanelWidthPercent: 55,
      }),
    ).toEqual({
      conversationSizePercent: CONVERSATION_RAIL_MIN_SIZE_PERCENT,
      workSurfaceSizePercent: 100 - CONVERSATION_RAIL_MIN_SIZE_PERCENT,
    });
    expect(
      resolveThreadWorkModeLayoutSizes({
        isWorkMode: false,
        isSecondaryPanelOpen: true,
        conversationRailWidthPercent: 12,
        secondaryPanelWidthPercent: 55,
      }),
    ).toEqual({
      conversationSizePercent: 45,
      workSurfaceSizePercent: 55,
    });
    expect(
      resolveConversationRailWidthUpdate({
        isWorkMode: true,
        isUserResizing: true,
        sizePercent: 88,
      }),
    ).toBe(CONVERSATION_RAIL_MAX_SIZE_PERCENT);
  });
});

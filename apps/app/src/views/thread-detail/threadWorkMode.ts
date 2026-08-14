import type { ThreadSurfaceArrangement } from "./ThreadSurfaceHost";

export type ThreadPresentationMode = "conversation" | "work";

export const DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT = 36;
export const CONVERSATION_RAIL_MIN_SIZE_PERCENT = 24;
export const WORK_SURFACE_MIN_SIZE_PERCENT = 40;

export function resolveThreadPresentationMode(
  isWorkMode: boolean,
): ThreadPresentationMode {
  return isWorkMode ? "work" : "conversation";
}

export function resolveThreadSurfaceArrangement(
  mode: ThreadPresentationMode,
): ThreadSurfaceArrangement {
  return mode === "work" ? "work-surface-primary" : "conversation-primary";
}

export function toggleThreadPresentationMode(
  mode: ThreadPresentationMode,
): ThreadPresentationMode {
  return mode === "work" ? "conversation" : "work";
}

export function canEnterThreadWorkMode(args: {
  hasEligibleWorkSurface: boolean;
  isCompactViewport: boolean;
  isSecondaryPanelOpen: boolean;
  isStandaloneLayout: boolean;
}): boolean {
  return (
    args.isStandaloneLayout &&
    args.isSecondaryPanelOpen &&
    !args.isCompactViewport &&
    args.hasEligibleWorkSurface
  );
}

export function resolveThreadWorkModeLayoutSizes(args: {
  isWorkMode: boolean;
  isSecondaryPanelOpen: boolean;
  conversationRailWidthPercent: number;
  secondaryPanelWidthPercent: number;
}): { conversationSizePercent: number; workSurfaceSizePercent: number } {
  if (!args.isSecondaryPanelOpen) {
    return {
      conversationSizePercent: 100,
      workSurfaceSizePercent: 0,
    };
  }
  if (args.isWorkMode) {
    return {
      conversationSizePercent: args.conversationRailWidthPercent,
      workSurfaceSizePercent: 100 - args.conversationRailWidthPercent,
    };
  }
  return {
    conversationSizePercent: 100 - args.secondaryPanelWidthPercent,
    workSurfaceSizePercent: args.secondaryPanelWidthPercent,
  };
}

export function resolveConversationRailWidthUpdate(args: {
  isWorkMode: boolean;
  isUserResizing: boolean;
  sizePercent: number;
}): number | null {
  if (!args.isWorkMode || !args.isUserResizing || args.sizePercent <= 0) {
    return null;
  }
  return args.sizePercent;
}

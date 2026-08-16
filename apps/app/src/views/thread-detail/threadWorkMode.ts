import type { ThreadSurfaceArrangement } from "./ThreadSurfaceHost";

export type ThreadPresentationMode = "conversation" | "work";

export const DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT = 36;
export const CONVERSATION_RAIL_MIN_SIZE_PERCENT = 24;
export const WORK_SURFACE_MIN_SIZE_PERCENT = 40;
export const CONVERSATION_RAIL_MAX_SIZE_PERCENT =
  100 - WORK_SURFACE_MIN_SIZE_PERCENT;

export function constrainConversationRailWidthPercent(
  widthPercent: number,
): number {
  if (!Number.isFinite(widthPercent)) {
    return DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT;
  }
  return Math.min(
    CONVERSATION_RAIL_MAX_SIZE_PERCENT,
    Math.max(CONVERSATION_RAIL_MIN_SIZE_PERCENT, widthPercent),
  );
}

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

/**
 * Whether this Thread may offer Work mode at all.
 *
 * A hosted split pane qualifies before it is maximized: entering Work mode is
 * what maximizes it, so gating the offer on the maximization would be circular
 * and the toggle could never be reached.
 */
export function canRequestThreadWorkMode(args: {
  hasEligibleWorkSurface: boolean;
  isCompactViewport: boolean;
  isSecondaryPanelOpen: boolean;
}): boolean {
  return (
    args.isSecondaryPanelOpen &&
    !args.isCompactViewport &&
    args.hasEligibleWorkSurface
  );
}

/**
 * Whether Work mode may actually render as the work-surface-primary layout.
 *
 * Work mode owns the full width of the window, so a hosted pane must hold the
 * whole workspace first. A standalone surface already does; a split pane does
 * once it is maximized. Between the request and the maximization the Thread
 * stays in the conversation layout for one commit, which is what keeps the
 * conversation rail out of every visible split pane.
 */
export function canEnterThreadWorkMode(args: {
  hasEligibleWorkSurface: boolean;
  isCompactViewport: boolean;
  isMaximizedPane: boolean;
  isSecondaryPanelOpen: boolean;
  isStandaloneLayout: boolean;
}): boolean {
  return (
    (args.isStandaloneLayout || args.isMaximizedPane) &&
    canRequestThreadWorkMode(args)
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
    const conversationSizePercent = constrainConversationRailWidthPercent(
      args.conversationRailWidthPercent,
    );
    return {
      conversationSizePercent,
      workSurfaceSizePercent: 100 - conversationSizePercent,
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
  return constrainConversationRailWidthPercent(args.sizePercent);
}

export function matchesThreadWorkModeSignal(
  signal: { projectId: string; threadId: string },
  target: { projectId: string; threadId: string },
): boolean {
  return (
    signal.projectId === target.projectId &&
    signal.threadId === target.threadId
  );
}

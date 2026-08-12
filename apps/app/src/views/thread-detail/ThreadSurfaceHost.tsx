import type { ReactNode } from "react";

export type ThreadSurfaceArrangement =
  | "conversation-primary"
  | "work-surface-primary";

export interface ThreadSurfaceRegionLayout {
  panelOrder: 1 | 2;
  resizeHandleVisualOrder: 2;
  visualOrder: 1 | 3;
}

interface ThreadSurfaceHostProps {
  arrangement: ThreadSurfaceArrangement;
  renderConversation: (layout: ThreadSurfaceRegionLayout) => ReactNode;
  renderWorkSurface: (layout: ThreadSurfaceRegionLayout) => ReactNode;
}

const CONVERSATION_PRIMARY_LAYOUT = {
  conversation: {
    panelOrder: 1,
    resizeHandleVisualOrder: 2,
    visualOrder: 1,
  },
  workSurface: {
    panelOrder: 2,
    resizeHandleVisualOrder: 2,
    visualOrder: 3,
  },
} as const;

const WORK_SURFACE_PRIMARY_LAYOUT = {
  conversation: {
    panelOrder: 2,
    resizeHandleVisualOrder: 2,
    visualOrder: 3,
  },
  workSurface: {
    panelOrder: 1,
    resizeHandleVisualOrder: 2,
    visualOrder: 1,
  },
} as const;

/**
 * Owns the one main conversation and one work-surface region for a Thread.
 *
 * The React child positions never change. Layout changes update only panel and
 * CSS order, so stateful descendants are not reparented or duplicated.
 */
export function ThreadSurfaceHost({
  arrangement,
  renderConversation,
  renderWorkSurface,
}: ThreadSurfaceHostProps) {
  const layout =
    arrangement === "conversation-primary"
      ? CONVERSATION_PRIMARY_LAYOUT
      : WORK_SURFACE_PRIMARY_LAYOUT;

  return (
    <>
      {renderConversation(layout.conversation)}
      {renderWorkSurface(layout.workSurface)}
    </>
  );
}

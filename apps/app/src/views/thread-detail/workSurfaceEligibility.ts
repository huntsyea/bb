import type { FixedPanelTab } from "@/lib/fixed-panel-tabs-state";

export const WORK_MODE_NO_SURFACE_NOTICE =
  "Returned to Conversation because no work surface is open.";

/**
 * Host-owned Work mode eligibility. Decides from tab kind only — never from
 * plugin identity or plugin content — so Docs, Side chat, and any other
 * plugin panel participate without a registration field.
 */
export function isEligibleWorkSurface(
  tab: Pick<FixedPanelTab, "kind">,
): boolean {
  switch (tab.kind) {
    case "git-diff":
    case "workspace-file-preview":
    case "host-file-preview":
    case "thread-storage-file-preview":
    case "browser":
    case "terminal":
    case "plugin-panel":
      return true;
    case "thread-info":
    case "new-tab":
      return false;
  }
}

export function hasEligibleWorkSurface(
  tabs: readonly Pick<FixedPanelTab, "kind">[],
): boolean {
  return tabs.some(isEligibleWorkSurface);
}

export function recordEligibleWorkSurfaceRecency(
  recencyTabIds: string[],
  tabId: string,
): string[] {
  if (recencyTabIds[0] === tabId) {
    return recencyTabIds;
  }
  return [tabId, ...recencyTabIds.filter((id) => id !== tabId)];
}

export function selectMostRecentlyUsedEligibleWorkSurface(args: {
  excludeTabId?: string | null;
  recencyTabIds: readonly string[];
  tabs: readonly FixedPanelTab[];
}): FixedPanelTab | null {
  const eligible = args.tabs.filter(
    (tab) => isEligibleWorkSurface(tab) && tab.id !== args.excludeTabId,
  );
  if (eligible.length === 0) {
    return null;
  }

  const eligibleById = new Map(eligible.map((tab) => [tab.id, tab]));
  for (const tabId of args.recencyTabIds) {
    const tab = eligibleById.get(tabId);
    if (tab !== undefined) {
      return tab;
    }
  }

  return eligible[eligible.length - 1] ?? null;
}

export interface EnterThreadWorkModeResolution {
  activeTabId: string | null;
  canEnter: boolean;
}

/**
 * Chooses the surface that should be primary when entering Work mode.
 * Does not attach work-surface identity or contents to prompt context.
 */
export function resolveEnterThreadWorkMode(args: {
  activeTabId: string | null;
  recencyTabIds: readonly string[];
  tabs: readonly FixedPanelTab[];
}): EnterThreadWorkModeResolution {
  const activeTab =
    args.activeTabId === null
      ? null
      : (args.tabs.find((tab) => tab.id === args.activeTabId) ?? null);
  if (activeTab !== null && isEligibleWorkSurface(activeTab)) {
    return { activeTabId: activeTab.id, canEnter: true };
  }

  const fallback = selectMostRecentlyUsedEligibleWorkSurface({
    recencyTabIds: args.recencyTabIds,
    tabs: args.tabs,
  });
  if (fallback === null) {
    return { activeTabId: args.activeTabId, canEnter: false };
  }
  return { activeTabId: fallback.id, canEnter: true };
}

export type WorkModeSurfaceReconciliation =
  | { activeTabId: string | null; kind: "keep" }
  | { activeTabId: string; kind: "activate" }
  | { kind: "exit" };

/**
 * Reconciles Work mode after a tab open, switch, close, or prune.
 *
 * A newly opened or user-selected tab is kept. Losing the active eligible
 * surface selects the most recently used remaining eligible tab. Losing the
 * last eligible surface exits Work mode.
 */
export function reconcileThreadWorkModeSurfaces(args: {
  activeTabId: string | null;
  isWorkMode: boolean;
  previousActiveTabId: string | null;
  previousWasEligible: boolean;
  recencyTabIds: readonly string[];
  tabs: readonly FixedPanelTab[];
}): WorkModeSurfaceReconciliation {
  if (!args.isWorkMode) {
    return { activeTabId: args.activeTabId, kind: "keep" };
  }

  const fallback = selectMostRecentlyUsedEligibleWorkSurface({
    recencyTabIds: args.recencyTabIds,
    tabs: args.tabs,
  });
  if (fallback === null) {
    return { kind: "exit" };
  }

  const previousStillPresent =
    args.previousActiveTabId !== null &&
    args.tabs.some((tab) => tab.id === args.previousActiveTabId);
  if (previousStillPresent) {
    return { activeTabId: args.activeTabId, kind: "keep" };
  }

  const activeTab =
    args.activeTabId === null
      ? null
      : (args.tabs.find((tab) => tab.id === args.activeTabId) ?? null);
  if (
    !args.previousWasEligible &&
    activeTab !== null &&
    isEligibleWorkSurface(activeTab)
  ) {
    return { activeTabId: activeTab.id, kind: "keep" };
  }

  if (fallback.id === args.activeTabId) {
    return { activeTabId: fallback.id, kind: "keep" };
  }
  return { activeTabId: fallback.id, kind: "activate" };
}

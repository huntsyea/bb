import type { FixedPanelTab } from "@/lib/fixed-panel-tabs-state";

export const WORK_MODE_NO_SURFACE_NOTICE =
  "Returned to Conversation because no work surface is open.";

/** Eligibility is tab kind only. */
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

export interface WorkSurfaceSnapshot {
  activeTabId: string | null;
  threadId: string;
  wasEligible: boolean;
}

export function createWorkSurfaceSnapshot(args: {
  activeTab: Pick<FixedPanelTab, "id" | "kind"> | null;
  threadId: string;
}): WorkSurfaceSnapshot {
  return {
    activeTabId: args.activeTab?.id ?? null,
    threadId: args.threadId,
    wasEligible:
      args.activeTab !== null && isEligibleWorkSurface(args.activeTab),
  };
}

export function resolveWorkSurfaceSnapshotForThread(args: {
  activeTab: Pick<FixedPanelTab, "id" | "kind"> | null;
  snapshot: WorkSurfaceSnapshot;
  threadId: string;
}): { didReset: boolean; snapshot: WorkSurfaceSnapshot } {
  if (args.snapshot.threadId === args.threadId) {
    return { didReset: false, snapshot: args.snapshot };
  }
  return {
    didReset: true,
    snapshot: createWorkSurfaceSnapshot({
      activeTab: args.activeTab,
      threadId: args.threadId,
    }),
  };
}

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

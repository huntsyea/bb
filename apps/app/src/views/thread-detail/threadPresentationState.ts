import { z } from "zod";
import {
  EMPTY_FIXED_PANEL_TABS_STATE,
  getFixedPanelTabsStateStorageKey,
  isFixedPanelTabsStateExpired,
  parseFixedPanelTabsState,
  type FixedPanelTab,
} from "@/lib/fixed-panel-tabs-state";
import {
  type ThreadPresentationMode,
  DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT,
} from "./threadWorkMode";
import {
  isEligibleWorkSurface,
  recordEligibleWorkSurfaceRecency,
  selectMostRecentlyUsedEligibleWorkSurface,
} from "./workSurfaceEligibility";

export const THREAD_PRESENTATION_STATE_VERSION = 1;
export const THREAD_PRESENTATION_STATE_STORAGE_PREFIX =
  "bb.thread.presentation";
export const CONVERSATION_RAIL_WIDTH_STORAGE_KEY =
  "bb.thread.conversationRail.widthPercent";

export interface ThreadPresentationState {
  version: typeof THREAD_PRESENTATION_STATE_VERSION;
  mode: ThreadPresentationMode;
  activeEligibleTabId: string | null;
  recencyTabIds: string[];
}

export const DEFAULT_THREAD_PRESENTATION_STATE: ThreadPresentationState = {
  version: THREAD_PRESENTATION_STATE_VERSION,
  mode: "conversation",
  activeEligibleTabId: null,
  recencyTabIds: [],
};

const threadPresentationStateSchema = z
  .object({
    version: z.literal(THREAD_PRESENTATION_STATE_VERSION),
    mode: z.enum(["conversation", "work"]),
    activeEligibleTabId: z.string().min(1).nullable(),
    recencyTabIds: z.array(z.string().min(1)),
  })
  .strict();

interface ThreadPresentationStorageKeyArgs {
  threadId: string;
}

export function getThreadPresentationStateStorageKey({
  threadId,
}: ThreadPresentationStorageKeyArgs): string {
  return `${THREAD_PRESENTATION_STATE_STORAGE_PREFIX}-${encodeURIComponent(threadId)}`;
}

export function threadIdFromPresentationStorageKey(key: string): string | null {
  const prefix = `${THREAD_PRESENTATION_STATE_STORAGE_PREFIX}-`;
  if (!key.startsWith(prefix)) {
    return null;
  }
  try {
    const threadId = decodeURIComponent(key.slice(prefix.length));
    return threadId.length > 0 ? threadId : null;
  } catch {
    return null;
  }
}

export function parseThreadPresentationState(
  storedValue: string | null,
): ThreadPresentationState | null {
  if (storedValue === null) {
    return null;
  }
  try {
    const result = threadPresentationStateSchema.safeParse(
      JSON.parse(storedValue),
    );
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function serializeThreadPresentationState(
  state: ThreadPresentationState,
): string {
  return JSON.stringify(state);
}

export function migrateLegacyCollapsedPresentationState(
  collapsedStoredValue: string | null,
): ThreadPresentationState {
  if (collapsedStoredValue !== "true") {
    return DEFAULT_THREAD_PRESENTATION_STATE;
  }
  return {
    ...DEFAULT_THREAD_PRESENTATION_STATE,
    mode: "work",
  };
}

export function resolveStoredThreadPresentationState(args: {
  legacyCollapsedStoredValue: string | null;
  storedValue: string | null;
}): ThreadPresentationState {
  return readThreadPresentationStateFromStorage(args).state;
}

export function readThreadPresentationStateFromStorage(args: {
  legacyCollapsedStoredValue: string | null;
  storedValue: string | null;
}): { persistMigratedValue: boolean; state: ThreadPresentationState } {
  const parsed = parseThreadPresentationState(args.storedValue);
  if (parsed !== null) {
    return { persistMigratedValue: false, state: parsed };
  }
  return {
    persistMigratedValue: true,
    state: migrateLegacyCollapsedPresentationState(
      args.legacyCollapsedStoredValue,
    ),
  };
}

export function areThreadPresentationStatesEqual(
  left: ThreadPresentationState,
  right: ThreadPresentationState,
): boolean {
  return (
    left.version === right.version &&
    left.mode === right.mode &&
    left.activeEligibleTabId === right.activeEligibleTabId &&
    left.recencyTabIds.length === right.recencyTabIds.length &&
    left.recencyTabIds.every(
      (tabId, index) => tabId === right.recencyTabIds[index],
    )
  );
}

function uniqueRecencyTabIds(recencyTabIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const tabId of recencyTabIds) {
    if (seen.has(tabId)) {
      continue;
    }
    seen.add(tabId);
    unique.push(tabId);
  }
  return unique;
}

function pruneRecencyTabIds(
  recencyTabIds: readonly string[],
  tabs: readonly Pick<FixedPanelTab, "id">[],
): string[] {
  const presentIds = new Set(tabs.map((tab) => tab.id));
  return uniqueRecencyTabIds(recencyTabIds).filter((tabId) =>
    presentIds.has(tabId),
  );
}

function presentActiveEligibleTabId(
  tabId: string | null,
  tabs: readonly Pick<FixedPanelTab, "id">[],
): string | null {
  if (tabId === null) {
    return null;
  }
  return tabs.some((tab) => tab.id === tabId) ? tabId : null;
}

export function selectRestoredEligibleWorkSurface(args: {
  preferredTabId: string | null;
  recencyTabIds: readonly string[];
  tabs: readonly FixedPanelTab[];
}): FixedPanelTab | null {
  if (args.preferredTabId !== null) {
    const preferred = args.tabs.find((tab) => tab.id === args.preferredTabId);
    if (preferred !== undefined && isEligibleWorkSurface(preferred)) {
      return preferred;
    }
  }
  return selectMostRecentlyUsedEligibleWorkSurface({
    recencyTabIds: args.recencyTabIds,
    tabs: args.tabs,
  });
}

export interface RestoredThreadPresentation {
  activateTabId: string | null;
  state: ThreadPresentationState;
}

export function restoreThreadPresentationState(args: {
  state: ThreadPresentationState;
  tabs: readonly FixedPanelTab[];
}): RestoredThreadPresentation {
  const recencyTabIds = pruneRecencyTabIds(args.state.recencyTabIds, args.tabs);
  if (args.state.mode !== "work") {
    return {
      activateTabId: null,
      state: {
        ...DEFAULT_THREAD_PRESENTATION_STATE,
        recencyTabIds,
        activeEligibleTabId: presentActiveEligibleTabId(
          args.state.activeEligibleTabId,
          args.tabs,
        ),
      },
    };
  }

  const selected = selectRestoredEligibleWorkSurface({
    preferredTabId: args.state.activeEligibleTabId,
    recencyTabIds,
    tabs: args.tabs,
  });
  if (selected === null) {
    return {
      activateTabId: null,
      state: {
        ...DEFAULT_THREAD_PRESENTATION_STATE,
        recencyTabIds,
      },
    };
  }

  return {
    activateTabId: selected.id,
    state: {
      version: THREAD_PRESENTATION_STATE_VERSION,
      mode: "work",
      activeEligibleTabId: selected.id,
      recencyTabIds: recordEligibleWorkSurfaceRecency(
        recencyTabIds,
        selected.id,
      ),
    },
  };
}

export type ThreadPresentationRestoreDecision =
  | { kind: "wait" }
  | {
      activateTabId: string | null;
      kind: "apply";
      state: ThreadPresentationState;
    };

export function haveThreadTabsHydrated(args: {
  hasQueryError: boolean;
  hasSettledQuery: boolean;
  isLocalOnlyRevision: boolean;
  localMatchesRemote: boolean;
  localTabCount: number;
}): boolean {
  if (!args.hasSettledQuery) {
    return false;
  }
  if (args.hasQueryError) {
    return true;
  }
  if (args.isLocalOnlyRevision && args.localTabCount > 0) {
    return true;
  }
  return args.localMatchesRemote;
}

export function resolveThreadPresentationRestore(args: {
  canEnterWorkMode: boolean;
  state: ThreadPresentationState;
  tabs: readonly FixedPanelTab[];
  tabsHydrated: boolean;
}): ThreadPresentationRestoreDecision {
  if (!args.tabsHydrated) {
    return { kind: "wait" };
  }

  const restored = restoreThreadPresentationState({
    state: args.state,
    tabs: args.tabs,
  });
  if (restored.state.mode === "work" && !args.canEnterWorkMode) {
    return {
      activateTabId: null,
      kind: "apply",
      state: restored.state,
    };
  }
  return {
    activateTabId: restored.activateTabId,
    kind: "apply",
    state: restored.state,
  };
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

export function pruneThreadPresentationStateStorage(args: {
  now: number;
}): void {
  const localStorage = getLocalStorage();
  if (localStorage === null) {
    return;
  }

  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null && threadIdFromPresentationStorageKey(key) !== null) {
      keys.push(key);
    }
  }

  for (const key of keys) {
    const threadId = threadIdFromPresentationStorageKey(key);
    if (threadId === null) {
      localStorage.removeItem(key);
      continue;
    }
    const tabStoredValue = localStorage.getItem(
      getFixedPanelTabsStateStorageKey({ threadId }),
    );
    if (tabStoredValue === null) {
      localStorage.removeItem(key);
      continue;
    }
    const tabState = parseFixedPanelTabsState({
      initialValue: EMPTY_FIXED_PANEL_TABS_STATE,
      now: args.now,
      storedValue: tabStoredValue,
    });
    if (isFixedPanelTabsStateExpired({ now: args.now, state: tabState })) {
      localStorage.removeItem(key);
    }
  }
}

export function parseConversationRailWidthPercent(
  storedValue: string | null,
  initialValue = DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT,
): number {
  if (storedValue === null) {
    return initialValue;
  }
  const parsed = Number.parseFloat(storedValue);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100
    ? parsed
    : initialValue;
}

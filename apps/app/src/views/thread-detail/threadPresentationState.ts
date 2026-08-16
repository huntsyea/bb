import { z } from "zod";
import {
  FIXED_PANEL_TABS_IDLE_EXPIRY_MS,
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
export const THREAD_CONVERSATION_COLLAPSED_STORAGE_PREFIX =
  "bb.thread.conversation.collapsed";
export const THREAD_PRESENTATION_COLLAPSED_MIGRATION_MARKER_PREFIX =
  "bb.thread.presentation.collapsedMigrated";
export const CONVERSATION_RAIL_WIDTH_STORAGE_KEY =
  "bb.thread.conversationRail.widthPercent";
export const THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS =
  FIXED_PANEL_TABS_IDLE_EXPIRY_MS;

export interface ThreadPresentationState {
  version: typeof THREAD_PRESENTATION_STATE_VERSION;
  mode: ThreadPresentationMode;
  activeEligibleTabId: string | null;
  recencyTabIds: string[];
  lastTouchedAt: number;
}

export const DEFAULT_THREAD_PRESENTATION_STATE: ThreadPresentationState = {
  version: THREAD_PRESENTATION_STATE_VERSION,
  mode: "conversation",
  activeEligibleTabId: null,
  recencyTabIds: [],
  lastTouchedAt: 0,
};

const threadPresentationStateSchema = z
  .object({
    version: z.literal(THREAD_PRESENTATION_STATE_VERSION),
    mode: z.enum(["conversation", "work"]),
    activeEligibleTabId: z.string().min(1).nullable(),
    recencyTabIds: z.array(z.string().min(1)),
    lastTouchedAt: z.number().int().nonnegative().optional(),
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

export function getThreadConversationCollapsedStorageKey({
  threadId,
}: ThreadPresentationStorageKeyArgs): string {
  return `${THREAD_CONVERSATION_COLLAPSED_STORAGE_PREFIX}-${encodeURIComponent(threadId)}`;
}

export function getThreadPresentationCollapsedMigrationMarkerKey({
  threadId,
}: ThreadPresentationStorageKeyArgs): string {
  return `${THREAD_PRESENTATION_COLLAPSED_MIGRATION_MARKER_PREFIX}-${encodeURIComponent(threadId)}`;
}

export function hasThreadPresentationCollapsedMigrationMarker(
  storedValue: string | null,
): boolean {
  return storedValue === "true";
}

export function threadIdFromPresentationMigrationMarkerKey(
  key: string,
): string | null {
  const prefix = `${THREAD_PRESENTATION_COLLAPSED_MIGRATION_MARKER_PREFIX}-`;
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
    if (!result.success) {
      return null;
    }
    return {
      ...result.data,
      lastTouchedAt: result.data.lastTouchedAt ?? 0,
    };
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
  hasCollapsedMigrationMarker: boolean;
  legacyCollapsedStoredValue: string | null;
  storedValue: string | null;
}): ThreadPresentationState {
  return readThreadPresentationStateFromStorage(args).state;
}

export function shouldPersistPresentationTouch(lastTouchedAt: number): boolean {
  return lastTouchedAt <= 0;
}

export function readThreadPresentationStateFromStorage(args: {
  hasCollapsedMigrationMarker: boolean;
  legacyCollapsedStoredValue: string | null;
  storedValue: string | null;
}): {
  persistMigratedValue: boolean;
  persistTouch: boolean;
  state: ThreadPresentationState;
} {
  const parsed = parseThreadPresentationState(args.storedValue);
  if (parsed !== null) {
    return {
      persistMigratedValue: false,
      persistTouch: shouldPersistPresentationTouch(parsed.lastTouchedAt),
      state: parsed,
    };
  }
  if (args.hasCollapsedMigrationMarker) {
    return {
      persistMigratedValue: false,
      persistTouch: true,
      state: DEFAULT_THREAD_PRESENTATION_STATE,
    };
  }
  return {
    persistMigratedValue: true,
    persistTouch: true,
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

export function touchThreadPresentationState(
  state: ThreadPresentationState,
  now: number,
): ThreadPresentationState {
  return {
    ...state,
    lastTouchedAt: now,
  };
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
      lastTouchedAt: args.state.lastTouchedAt,
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
    return args.localTabCount > 0;
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

export function shouldPruneThreadPresentationState(args: {
  now: number;
  retainThreadId?: string | null;
  state: ThreadPresentationState;
  threadId: string;
}): boolean {
  if (args.retainThreadId === args.threadId) {
    return false;
  }
  if (args.state.lastTouchedAt <= 0) {
    return false;
  }
  return (
    args.now - args.state.lastTouchedAt >
    THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS
  );
}

export function shouldRemovePresentationMigrationMarker(args: {
  hasCollapsedKey: boolean;
  hasPresentationKey: boolean;
  retainThreadId?: string | null;
  threadId: string;
}): boolean {
  if (args.retainThreadId === args.threadId) {
    return false;
  }
  return !args.hasPresentationKey && !args.hasCollapsedKey;
}

export function pruneThreadPresentationStateStorage(args: {
  now: number;
  retainThreadId?: string | null;
}): void {
  const localStorage = getLocalStorage();
  if (localStorage === null) {
    return;
  }

  const presentationKeys: string[] = [];
  const markerKeys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key === null) {
      continue;
    }
    if (threadIdFromPresentationStorageKey(key) !== null) {
      presentationKeys.push(key);
      continue;
    }
    if (threadIdFromPresentationMigrationMarkerKey(key) !== null) {
      markerKeys.push(key);
    }
  }

  for (const key of presentationKeys) {
    const threadId = threadIdFromPresentationStorageKey(key);
    if (threadId === null) {
      localStorage.removeItem(key);
      continue;
    }
    const state = parseThreadPresentationState(localStorage.getItem(key));
    if (state === null) {
      localStorage.removeItem(key);
      if (
        localStorage.getItem(
          getThreadConversationCollapsedStorageKey({ threadId }),
        ) === null
      ) {
        localStorage.removeItem(
          getThreadPresentationCollapsedMigrationMarkerKey({ threadId }),
        );
      }
      continue;
    }
    if (
      !shouldPruneThreadPresentationState({
        now: args.now,
        retainThreadId: args.retainThreadId,
        state,
        threadId,
      })
    ) {
      continue;
    }
    localStorage.removeItem(key);
    if (
      localStorage.getItem(
        getThreadConversationCollapsedStorageKey({ threadId }),
      ) === null
    ) {
      localStorage.removeItem(
        getThreadPresentationCollapsedMigrationMarkerKey({ threadId }),
      );
    }
  }

  for (const key of markerKeys) {
    const threadId = threadIdFromPresentationMigrationMarkerKey(key);
    if (threadId === null) {
      localStorage.removeItem(key);
      continue;
    }
    if (
      shouldRemovePresentationMigrationMarker({
        hasCollapsedKey:
          localStorage.getItem(
            getThreadConversationCollapsedStorageKey({ threadId }),
          ) !== null,
        hasPresentationKey:
          localStorage.getItem(
            getThreadPresentationStateStorageKey({ threadId }),
          ) !== null,
        retainThreadId: args.retainThreadId,
        threadId,
      })
    ) {
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

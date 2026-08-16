import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { atomFamily } from "jotai-family";
import {
  createLocalStorageSyncStorage,
  type SyncStorage,
} from "@/lib/browser-storage";
import { DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT } from "@/views/thread-detail/threadWorkMode";
import {
  CONVERSATION_RAIL_WIDTH_STORAGE_KEY,
  DEFAULT_THREAD_PRESENTATION_STATE,
  getThreadConversationCollapsedStorageKey,
  getThreadPresentationCollapsedMigrationMarkerKey,
  getThreadPresentationStateStorageKey,
  hasThreadPresentationCollapsedMigrationMarker,
  parseConversationRailWidthPercent,
  parseThreadPresentationState,
  serializeThreadPresentationState,
  threadIdFromPresentationStorageKey,
  touchThreadPresentationState,
  readThreadPresentationStateFromStorage,
  type ThreadPresentationState,
} from "@/views/thread-detail/threadPresentationState";

export { getThreadConversationCollapsedStorageKey };

export const threadSecondaryPanelResizingAtom = atom(false);

type ResolvedThreadSecondaryPanelThreadId = string;
type ThreadSecondaryPanelThreadId =
  | ResolvedThreadSecondaryPanelThreadId
  | null
  | undefined;

/**
 * User's preferred secondary panel width as a percentage of the surrounding
 * PanelGroup. Persisted across reloads. The default (50) is used when the
 * panel opens for the first time.
 */
export const DEFAULT_SECONDARY_PANEL_WIDTH_PERCENT = 50;
const secondaryPanelWidthStorage = createLocalStorageSyncStorage<number>({
  parse: (storedValue, initialValue) => {
    if (storedValue === null) return initialValue;
    const parsed = Number.parseFloat(storedValue);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 100
      ? parsed
      : initialValue;
  },
  serialize: (value) => String(value),
});
export const secondaryPanelWidthPercentAtom = atomWithStorage<number>(
  "bb.thread.secondaryPanel.widthPercent",
  DEFAULT_SECONDARY_PANEL_WIDTH_PERCENT,
  secondaryPanelWidthStorage,
  { getOnInit: true },
);

const threadSecondaryPanelBooleanStorage =
  createLocalStorageSyncStorage<boolean>({
    parse: (storedValue, initialValue) => {
      if (storedValue === "true") return true;
      if (storedValue === "false") return false;
      return initialValue;
    },
    serialize: (value) => String(value),
  });

function hasThreadId(
  threadId: ThreadSecondaryPanelThreadId,
): threadId is ResolvedThreadSecondaryPanelThreadId {
  return threadId !== null && threadId !== undefined && threadId.length > 0;
}

/**
 * Whether a given thread's conversation/timeline pane is collapsed so the
 * secondary panel fills the whole content area. Keyed per thread (like the
 * terminal panel and recent-items state) so collapsing one thread's
 * conversation — e.g. opening an app from the sidebar — never
 * leaks into another thread or gets cleared by selecting an unrelated row.
 * Persisted per thread; only takes effect while the secondary panel is open on
 * a wide viewport — see ThreadDetailSecondaryContent for the gating.
 */
const conversationCollapsedStorage = threadSecondaryPanelBooleanStorage;

const threadConversationCollapsedAtomFamily = atomFamily(
  (threadId: ResolvedThreadSecondaryPanelThreadId) =>
    atomWithStorage<boolean>(
      getThreadConversationCollapsedStorageKey({ threadId }),
      false,
      conversationCollapsedStorage,
      { getOnInit: true },
    ),
);

// Fallback for callers without a resolved thread id (e.g. before routing
// settles). It stays false and any write lands on this throwaway atom, so no
// real thread's collapse state is affected.
const disabledThreadConversationCollapsedAtom = atom(false);

/**
 * The conversation-collapsed atom for a specific thread. `atomFamily` memoizes
 * by threadId, so repeated calls with the same id return a stable atom
 * reference safe to pass straight to `useAtom`/`useSetAtom`/`useAtomValue`.
 */
export function getThreadConversationCollapsedAtom(
  threadId: ThreadSecondaryPanelThreadId,
) {
  return hasThreadId(threadId)
    ? threadConversationCollapsedAtomFamily(threadId)
    : disabledThreadConversationCollapsedAtom;
}

function readLegacyCollapsedStoredValue(threadId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(
    getThreadConversationCollapsedStorageKey({ threadId }),
  );
}

const threadPresentationStateStorage: SyncStorage<ThreadPresentationState> = {
  getItem: (key, initialValue) => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    const threadId = threadIdFromPresentationStorageKey(key);
    const storedValue = window.localStorage.getItem(key);
    const resolved = readThreadPresentationStateFromStorage({
      storedValue,
      hasCollapsedMigrationMarker:
        threadId !== null &&
        hasThreadPresentationCollapsedMigrationMarker(
          window.localStorage.getItem(
            getThreadPresentationCollapsedMigrationMarkerKey({ threadId }),
          ),
        ),
      legacyCollapsedStoredValue:
        threadId === null ? null : readLegacyCollapsedStoredValue(threadId),
    });
    if (resolved.persistMigratedValue || resolved.persistTouch) {
      window.localStorage.setItem(
        key,
        serializeThreadPresentationState(
          touchThreadPresentationState(resolved.state, Date.now()),
        ),
      );
    }
    if (resolved.persistMigratedValue && threadId !== null) {
      window.localStorage.setItem(
        getThreadPresentationCollapsedMigrationMarkerKey({ threadId }),
        "true",
      );
    }
    return resolved.state;
  },
  setItem: (key, value) => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      key,
      serializeThreadPresentationState(
        touchThreadPresentationState(value, Date.now()),
      ),
    );
  },
  removeItem: (key) => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(key);
  },
  subscribe: (key, callback) => {
    if (typeof window === "undefined") {
      return () => {};
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== key) {
        return;
      }
      if (event.newValue === null) {
        return;
      }
      const parsed = parseThreadPresentationState(event.newValue);
      if (parsed === null) {
        return;
      }
      callback(parsed);
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  },
};

const threadPresentationStateAtomFamily = atomFamily(
  (threadId: ResolvedThreadSecondaryPanelThreadId) =>
    atomWithStorage<ThreadPresentationState>(
      getThreadPresentationStateStorageKey({ threadId }),
      DEFAULT_THREAD_PRESENTATION_STATE,
      threadPresentationStateStorage,
      { getOnInit: true },
    ),
);

const disabledThreadPresentationStateAtom = atom(
  DEFAULT_THREAD_PRESENTATION_STATE,
);

/**
 * Client-local Work mode presentation for a Thread: mode, last eligible
 * surface, and recency. Persisted per Thread in localStorage so reload and
 * Thread switches restore only that Thread's layout on this client.
 */
export function getThreadPresentationStateAtom(
  threadId: ThreadSecondaryPanelThreadId,
) {
  return hasThreadId(threadId)
    ? threadPresentationStateAtomFamily(threadId)
    : disabledThreadPresentationStateAtom;
}

const threadWorkModeAtomFamily = atomFamily(
  (threadId: ResolvedThreadSecondaryPanelThreadId) =>
    atom(
      (get) => get(threadPresentationStateAtomFamily(threadId)).mode === "work",
      (get, set, update: (current: boolean) => boolean) => {
        const presentationAtom = threadPresentationStateAtomFamily(threadId);
        const current = get(presentationAtom);
        const isWorkMode = current.mode === "work";
        const next = update(isWorkMode);
        if (next === isWorkMode) {
          return;
        }
        set(presentationAtom, {
          ...current,
          mode: next ? "work" : "conversation",
          activeEligibleTabId: next
            ? (current.recencyTabIds[0] ?? current.activeEligibleTabId)
            : current.activeEligibleTabId,
        });
      },
    ),
);

const disabledThreadWorkModeAtom = atom(false);

/**
 * Client-local Work mode flag for a Thread. Backed by persisted presentation
 * state so reload restores this client's last valid mode.
 */
export function getThreadWorkModeAtom(threadId: ThreadSecondaryPanelThreadId) {
  return hasThreadId(threadId)
    ? threadWorkModeAtomFamily(threadId)
    : disabledThreadWorkModeAtom;
}

const threadWorkSurfaceRecencyAtomFamily = atomFamily(
  (threadId: ResolvedThreadSecondaryPanelThreadId) =>
    atom(
      (get) => get(threadPresentationStateAtomFamily(threadId)).recencyTabIds,
      (get, set, update: (current: string[]) => string[]) => {
        const presentationAtom = threadPresentationStateAtomFamily(threadId);
        const current = get(presentationAtom);
        const next = update(current.recencyTabIds);
        if (next === current.recencyTabIds) {
          return;
        }
        set(presentationAtom, {
          ...current,
          recencyTabIds: next,
          activeEligibleTabId: next[0] ?? current.activeEligibleTabId,
        });
      },
    ),
);

const disabledThreadWorkSurfaceRecencyAtom = atom<string[]>([]);

/**
 * Client-local most-recently-used eligible work-surface ids for a Thread.
 * Newest first. Persisted with the Thread's presentation so reload can fall
 * back by recent use.
 */
export function getThreadWorkSurfaceRecencyAtom(
  threadId: ThreadSecondaryPanelThreadId,
) {
  return hasThreadId(threadId)
    ? threadWorkSurfaceRecencyAtomFamily(threadId)
    : disabledThreadWorkSurfaceRecencyAtom;
}

const conversationRailWidthStorage = createLocalStorageSyncStorage<number>({
  parse: (storedValue, initialValue) =>
    parseConversationRailWidthPercent(storedValue, initialValue),
  serialize: (value) => String(value),
});

/**
 * Preferred conversation-rail width while Work mode is active. One
 * client-wide value, independent from {@link secondaryPanelWidthPercentAtom}
 * so switching modes does not overwrite either preference. Responsive
 * min/max constraints are applied at render time.
 */
export const conversationRailWidthPercentAtom = atomWithStorage<number>(
  CONVERSATION_RAIL_WIDTH_STORAGE_KEY,
  DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT,
  conversationRailWidthStorage,
  { getOnInit: true },
);

export { CONVERSATION_RAIL_WIDTH_STORAGE_KEY };

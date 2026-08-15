import { z } from "zod";
import type { FixedPanelTab } from "@/lib/fixed-panel-tabs-state";
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
  return (
    parseThreadPresentationState(args.storedValue) ??
    migrateLegacyCollapsedPresentationState(args.legacyCollapsedStoredValue)
  );
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
        activeEligibleTabId: args.state.activeEligibleTabId,
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

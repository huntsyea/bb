// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  createGitDiffFixedPanelTab,
  createNewTabFixedPanelTab,
  createThreadInfoFixedPanelTab,
  createWorkspaceFilePreviewFixedPanelTab,
  type FixedPanelTab,
} from "@/lib/fixed-panel-tabs-state";
import {
  DEFAULT_THREAD_PRESENTATION_STATE,
  THREAD_PRESENTATION_STATE_VERSION,
  areThreadPresentationStatesEqual,
  getThreadPresentationStateStorageKey,
  haveThreadTabsHydrated,
  migrateLegacyCollapsedPresentationState,
  parseConversationRailWidthPercent,
  parseThreadPresentationState,
  pruneThreadPresentationStateStorage,
  readThreadPresentationStateFromStorage,
  resolveStoredThreadPresentationState,
  resolveThreadPresentationRestore,
  restoreThreadPresentationState,
  serializeThreadPresentationState,
  threadIdFromPresentationStorageKey,
  type ThreadPresentationState,
} from "./threadPresentationState";
import { DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT } from "./threadWorkMode";
import {
  FIXED_PANEL_TABS_IDLE_EXPIRY_MS,
  createEmptyFixedPanelTabsState,
  getFixedPanelTabsStateStorageKey,
  serializeFixedPanelTabsState,
} from "@/lib/fixed-panel-tabs-state";

function workspaceFile(path: string): FixedPanelTab {
  return createWorkspaceFilePreviewFixedPanelTab({
    environmentId: "env-1",
    projectId: null,
    tab: {
      lineRange: null,
      path,
      source: { kind: "working-tree" },
      statusLabel: null,
    },
  });
}

function presentation(
  overrides: Partial<ThreadPresentationState> = {},
): ThreadPresentationState {
  return {
    ...DEFAULT_THREAD_PRESENTATION_STATE,
    ...overrides,
  };
}

afterEach(() => {
  window.localStorage.clear();
});

describe("threadPresentationState", () => {
  it("stores mode and the active eligible surface per Thread", () => {
    const fileA = workspaceFile("a.ts");
    const threadA = getThreadPresentationStateStorageKey({
      threadId: "thr-a",
    });
    const threadB = getThreadPresentationStateStorageKey({
      threadId: "thr-b",
    });

    expect(threadA).not.toBe(threadB);
    expect(threadIdFromPresentationStorageKey(threadA)).toBe("thr-a");
    expect(threadIdFromPresentationStorageKey(threadB)).toBe("thr-b");

    const stored = serializeThreadPresentationState(
      presentation({
        mode: "work",
        activeEligibleTabId: fileA.id,
        recencyTabIds: [fileA.id],
      }),
    );
    expect(parseThreadPresentationState(stored)).toEqual({
      version: THREAD_PRESENTATION_STATE_VERSION,
      mode: "work",
      activeEligibleTabId: fileA.id,
      recencyTabIds: [fileA.id],
    });
    expect(parseThreadPresentationState("{")).toBeNull();
    expect(parseThreadPresentationState(null)).toBeNull();
  });

  it("migrates a saved collapsed state only when restore still has a valid surface", () => {
    const fileA = workspaceFile("a.ts");
    const info = createThreadInfoFixedPanelTab();
    const newTab = createNewTabFixedPanelTab();
    const migrated = migrateLegacyCollapsedPresentationState("true");

    expect(migrated).toEqual(presentation({ mode: "work" }));
    expect(migrateLegacyCollapsedPresentationState("false")).toEqual(
      DEFAULT_THREAD_PRESENTATION_STATE,
    );
    expect(migrateLegacyCollapsedPresentationState(null)).toEqual(
      DEFAULT_THREAD_PRESENTATION_STATE,
    );
    expect(
      restoreThreadPresentationState({
        state: migrated,
        tabs: [info, fileA, newTab],
      }),
    ).toEqual({
      activateTabId: fileA.id,
      state: presentation({
        mode: "work",
        activeEligibleTabId: fileA.id,
        recencyTabIds: [fileA.id],
      }),
    });
    expect(
      restoreThreadPresentationState({
        state: migrated,
        tabs: [info, newTab],
      }),
    ).toEqual({
      activateTabId: null,
      state: DEFAULT_THREAD_PRESENTATION_STATE,
    });
  });

  it("prefers a stored presentation over a leftover collapsed value", () => {
    const fileA = workspaceFile("a.ts");
    const stored = serializeThreadPresentationState(
      presentation({
        mode: "conversation",
        activeEligibleTabId: fileA.id,
        recencyTabIds: [fileA.id],
      }),
    );

    expect(
      resolveStoredThreadPresentationState({
        storedValue: stored,
        legacyCollapsedStoredValue: "true",
      }),
    ).toEqual(
      presentation({
        mode: "conversation",
        activeEligibleTabId: fileA.id,
        recencyTabIds: [fileA.id],
      }),
    );
  });

  it("restores the most recent valid surface and falls back by recent use", () => {
    const fileA = workspaceFile("a.ts");
    const fileB = workspaceFile("b.ts");
    const diff = createGitDiffFixedPanelTab();
    const info = createThreadInfoFixedPanelTab();
    const newTab = createNewTabFixedPanelTab();

    expect(
      restoreThreadPresentationState({
        state: presentation({
          mode: "work",
          activeEligibleTabId: fileB.id,
          recencyTabIds: [fileB.id, diff.id, fileA.id],
        }),
        tabs: [info, fileA, fileB, diff, newTab],
      }).activateTabId,
    ).toBe(fileB.id);

    expect(
      restoreThreadPresentationState({
        state: presentation({
          mode: "work",
          activeEligibleTabId: "gone",
          recencyTabIds: ["gone", diff.id, fileA.id],
        }),
        tabs: [info, fileA, diff, newTab],
      }),
    ).toEqual({
      activateTabId: diff.id,
      state: presentation({
        mode: "work",
        activeEligibleTabId: diff.id,
        recencyTabIds: [diff.id, fileA.id],
      }),
    });
  });

  it("returns to Conversation mode when no valid surface remains", () => {
    const fileA = workspaceFile("a.ts");
    const info = createThreadInfoFixedPanelTab();
    const newTab = createNewTabFixedPanelTab();

    expect(
      restoreThreadPresentationState({
        state: presentation({
          mode: "work",
          activeEligibleTabId: fileA.id,
          recencyTabIds: [fileA.id],
        }),
        tabs: [info, newTab],
      }),
    ).toEqual({
      activateTabId: null,
      state: DEFAULT_THREAD_PRESENTATION_STATE,
    });
  });

  it("restores only the destination Thread's presentation", () => {
    const fileOnA = workspaceFile("notes.md");
    const fileOnB = workspaceFile("other.ts");
    const restoredA = restoreThreadPresentationState({
      state: presentation({
        mode: "work",
        activeEligibleTabId: fileOnA.id,
        recencyTabIds: [fileOnA.id],
      }),
      tabs: [fileOnA],
    });
    const restoredB = restoreThreadPresentationState({
      state: presentation({
        mode: "conversation",
        recencyTabIds: [fileOnB.id],
      }),
      tabs: [fileOnB],
    });

    expect(restoredA.state.mode).toBe("work");
    expect(restoredA.activateTabId).toBe(fileOnA.id);
    expect(restoredB.state.mode).toBe("conversation");
    expect(restoredB.activateTabId).toBeNull();
    expect(
      areThreadPresentationStatesEqual(restoredA.state, restoredB.state),
    ).toBe(false);
  });

  it("keeps Conversation mode on reload even when eligible surfaces exist", () => {
    const fileA = workspaceFile("a.ts");

    expect(
      restoreThreadPresentationState({
        state: presentation({
          mode: "conversation",
          recencyTabIds: [fileA.id],
        }),
        tabs: [fileA],
      }),
    ).toEqual({
      activateTabId: null,
      state: presentation({
        recencyTabIds: [fileA.id],
      }),
    });
  });

  it("nulls a conversation active surface that is no longer among the tabs", () => {
    const fileA = workspaceFile("a.ts");
    const fileB = workspaceFile("b.ts");

    expect(
      restoreThreadPresentationState({
        state: presentation({
          mode: "conversation",
          activeEligibleTabId: fileB.id,
          recencyTabIds: [fileB.id, fileA.id],
        }),
        tabs: [fileA],
      }),
    ).toEqual({
      activateTabId: null,
      state: presentation({
        recencyTabIds: [fileA.id],
        activeEligibleTabId: null,
      }),
    });
  });

  it("does not persist a conversation fallback until tabs have hydrated", () => {
    const fileA = workspaceFile("a.ts");
    const storedWork = presentation({
      mode: "work",
      activeEligibleTabId: fileA.id,
      recencyTabIds: [fileA.id],
    });

    expect(
      resolveThreadPresentationRestore({
        canEnterWorkMode: false,
        state: storedWork,
        tabs: [],
        tabsHydrated: false,
      }),
    ).toEqual({ kind: "wait" });
    expect(
      haveThreadTabsHydrated({
        hasQueryError: false,
        hasSettledQuery: false,
        isLocalOnlyRevision: false,
        localMatchesRemote: false,
        localTabCount: 0,
      }),
    ).toBe(false);
  });

  it("does not activate a restored Work surface when Work mode cannot be entered", () => {
    const fileA = workspaceFile("a.ts");
    const storedWork = presentation({
      mode: "work",
      activeEligibleTabId: fileA.id,
      recencyTabIds: [fileA.id],
    });

    expect(
      resolveThreadPresentationRestore({
        canEnterWorkMode: false,
        state: storedWork,
        tabs: [fileA],
        tabsHydrated: true,
      }),
    ).toEqual({
      activateTabId: null,
      kind: "apply",
      state: storedWork,
    });
    expect(
      resolveThreadPresentationRestore({
        canEnterWorkMode: true,
        state: storedWork,
        tabs: [fileA],
        tabsHydrated: true,
      }),
    ).toEqual({
      activateTabId: fileA.id,
      kind: "apply",
      state: storedWork,
    });
  });

  it("persists a conversation fallback only after a hydrated empty tab list", () => {
    const fileA = workspaceFile("a.ts");

    expect(
      resolveThreadPresentationRestore({
        canEnterWorkMode: false,
        state: presentation({
          mode: "work",
          activeEligibleTabId: fileA.id,
          recencyTabIds: [fileA.id],
        }),
        tabs: [],
        tabsHydrated: true,
      }),
    ).toEqual({
      activateTabId: null,
      kind: "apply",
      state: DEFAULT_THREAD_PRESENTATION_STATE,
    });
  });

  it("treats a settled local-only tab revision as hydrated", () => {
    expect(
      haveThreadTabsHydrated({
        hasQueryError: false,
        hasSettledQuery: true,
        isLocalOnlyRevision: true,
        localMatchesRemote: false,
        localTabCount: 2,
      }),
    ).toBe(true);
    expect(
      haveThreadTabsHydrated({
        hasQueryError: false,
        hasSettledQuery: true,
        isLocalOnlyRevision: false,
        localMatchesRemote: false,
        localTabCount: 0,
      }),
    ).toBe(false);
  });

  it("writes a migrated presentation once so later collapsed values cannot re-seed Work mode", () => {
    expect(
      readThreadPresentationStateFromStorage({
        storedValue: null,
        legacyCollapsedStoredValue: "true",
      }),
    ).toEqual({
      persistMigratedValue: true,
      state: presentation({ mode: "work" }),
    });
    expect(
      readThreadPresentationStateFromStorage({
        storedValue: serializeThreadPresentationState(
          presentation({ mode: "conversation" }),
        ),
        legacyCollapsedStoredValue: "true",
      }),
    ).toEqual({
      persistMigratedValue: false,
      state: presentation({ mode: "conversation" }),
    });
  });

  it("accepts a stored rail width and rejects invalid values", () => {
    expect(parseConversationRailWidthPercent("42")).toBe(42);
    expect(
      parseConversationRailWidthPercent(
        null,
        DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT,
      ),
    ).toBe(DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT);
    expect(parseConversationRailWidthPercent("nope")).toBe(
      DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT,
    );
    expect(parseConversationRailWidthPercent("0")).toBe(
      DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT,
    );
    expect(parseConversationRailWidthPercent("101")).toBe(
      DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT,
    );
  });

  it("prunes presentation keys whose tab storage is missing or expired", () => {
    const now = 1_700_000_000_000;
    const liveThreadId = "thr-live";
    const expiredThreadId = "thr-expired";
    const orphanThreadId = "thr-orphan";
    window.localStorage.setItem(
      getThreadPresentationStateStorageKey({ threadId: liveThreadId }),
      serializeThreadPresentationState(presentation({ mode: "work" })),
    );
    window.localStorage.setItem(
      getFixedPanelTabsStateStorageKey({ threadId: liveThreadId }),
      serializeFixedPanelTabsState({
        state: createEmptyFixedPanelTabsState({ lastUsedAt: now }),
      }),
    );
    window.localStorage.setItem(
      getThreadPresentationStateStorageKey({ threadId: expiredThreadId }),
      serializeThreadPresentationState(presentation({ mode: "work" })),
    );
    window.localStorage.setItem(
      getFixedPanelTabsStateStorageKey({ threadId: expiredThreadId }),
      serializeFixedPanelTabsState({
        state: createEmptyFixedPanelTabsState({
          lastUsedAt: now - FIXED_PANEL_TABS_IDLE_EXPIRY_MS - 1,
        }),
      }),
    );
    window.localStorage.setItem(
      getThreadPresentationStateStorageKey({ threadId: orphanThreadId }),
      serializeThreadPresentationState(presentation({ mode: "work" })),
    );

    pruneThreadPresentationStateStorage({ now });

    expect(
      window.localStorage.getItem(
        getThreadPresentationStateStorageKey({ threadId: liveThreadId }),
      ),
    ).not.toBeNull();
    expect(
      window.localStorage.getItem(
        getThreadPresentationStateStorageKey({ threadId: expiredThreadId }),
      ),
    ).toBeNull();
    expect(
      window.localStorage.getItem(
        getThreadPresentationStateStorageKey({ threadId: orphanThreadId }),
      ),
    ).toBeNull();
  });
});

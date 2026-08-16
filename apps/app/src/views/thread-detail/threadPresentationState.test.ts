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
  shouldPruneThreadPresentationState,
  shouldRemovePresentationMigrationMarker,
  shouldPersistPresentationTouch,
  getThreadConversationCollapsedStorageKey,
  getThreadPresentationCollapsedMigrationMarkerKey,
  THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS,
  touchThreadPresentationState,
  readThreadPresentationStateFromStorage,
  resolveStoredThreadPresentationState,
  resolveThreadPresentationRestore,
  restoreThreadPresentationState,
  serializeThreadPresentationState,
  threadIdFromPresentationStorageKey,
  type ThreadPresentationState,
} from "./threadPresentationState";
import { DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT } from "./threadWorkMode";

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
      lastTouchedAt: 0,
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
        hasCollapsedMigrationMarker: false,
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

  it("does not treat a tab-query error as hydration when no local tabs exist", () => {
    expect(
      haveThreadTabsHydrated({
        hasQueryError: true,
        hasSettledQuery: true,
        isLocalOnlyRevision: false,
        localMatchesRemote: false,
        localTabCount: 0,
      }),
    ).toBe(false);
    expect(
      resolveThreadPresentationRestore({
        canEnterWorkMode: false,
        state: presentation({
          mode: "work",
          activeEligibleTabId: "tab-docs",
          recencyTabIds: ["tab-docs"],
        }),
        tabs: [],
        tabsHydrated: haveThreadTabsHydrated({
          hasQueryError: true,
          hasSettledQuery: true,
          isLocalOnlyRevision: false,
          localMatchesRemote: false,
          localTabCount: 0,
        }),
      }),
    ).toEqual({ kind: "wait" });
    expect(
      haveThreadTabsHydrated({
        hasQueryError: true,
        hasSettledQuery: true,
        isLocalOnlyRevision: false,
        localMatchesRemote: false,
        localTabCount: 2,
      }),
    ).toBe(true);
  });

  it("writes a migrated presentation once so later collapsed values cannot re-seed Work mode", () => {
    expect(
      readThreadPresentationStateFromStorage({
        hasCollapsedMigrationMarker: false,
        storedValue: null,
        legacyCollapsedStoredValue: "true",
      }),
    ).toEqual({
      persistMigratedValue: true,
      persistTouch: true,
      state: presentation({ mode: "work" }),
    });
    expect(
      readThreadPresentationStateFromStorage({
        hasCollapsedMigrationMarker: false,
        storedValue: serializeThreadPresentationState(
          presentation({ mode: "conversation" }),
        ),
        legacyCollapsedStoredValue: "true",
      }),
    ).toEqual({
      persistMigratedValue: false,
      persistTouch: true,
      state: presentation({ mode: "conversation" }),
    });
    expect(
      readThreadPresentationStateFromStorage({
        hasCollapsedMigrationMarker: true,
        storedValue: null,
        legacyCollapsedStoredValue: "true",
      }),
    ).toEqual({
      persistMigratedValue: false,
      persistTouch: true,
      state: DEFAULT_THREAD_PRESENTATION_STATE,
    });
    expect(
      readThreadPresentationStateFromStorage({
        hasCollapsedMigrationMarker: false,
        storedValue: null,
        legacyCollapsedStoredValue: null,
      }),
    ).toEqual({
      persistMigratedValue: true,
      persistTouch: true,
      state: DEFAULT_THREAD_PRESENTATION_STATE,
    });
  });

  it("keeps a hosted-pane collapse preference through presentation migration", () => {
    const collapsedKey = getThreadConversationCollapsedStorageKey({
      threadId: "thr-hosted",
    });
    const markerKey = getThreadPresentationCollapsedMigrationMarkerKey({
      threadId: "thr-hosted",
    });
    expect(
      readThreadPresentationStateFromStorage({
        hasCollapsedMigrationMarker: false,
        storedValue: null,
        legacyCollapsedStoredValue: "true",
      }).state.mode,
    ).toBe("work");
    expect(collapsedKey).toContain("conversation.collapsed");
    expect(markerKey).toContain("collapsedMigrated");
    expect(
      readThreadPresentationStateFromStorage({
        hasCollapsedMigrationMarker: true,
        storedValue: null,
        legacyCollapsedStoredValue: "true",
      }).state.mode,
    ).toBe("conversation");
  });

  it("does not expire a daily-use record after it is touched on read", () => {
    const openedAt = 1_700_000_000_000;
    const nextDay = openedAt + 24 * 60 * 60 * 1000;
    const daily = presentation({
      mode: "work",
      lastTouchedAt: openedAt,
    });
    expect(
      shouldPruneThreadPresentationState({
        now: openedAt + THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS + 1,
        state: daily,
        threadId: "thr-daily",
      }),
    ).toBe(true);
    const touched = touchThreadPresentationState(daily, nextDay);
    expect(
      shouldPruneThreadPresentationState({
        now: nextDay,
        state: touched,
        threadId: "thr-daily",
      }),
    ).toBe(false);
    expect(
      shouldPruneThreadPresentationState({
        now: nextDay + THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS + 1,
        state: touched,
        threadId: "thr-daily",
      }),
    ).toBe(true);
  });

  it("touches a record with no lastTouchedAt so normal expiry applies", () => {
    const now = 1_700_000_000_000;
    const parsed = parseThreadPresentationState(
      JSON.stringify({
        version: THREAD_PRESENTATION_STATE_VERSION,
        mode: "work",
        activeEligibleTabId: null,
        recencyTabIds: [],
      }),
    );
    expect(parsed?.lastTouchedAt).toBe(0);
    expect(shouldPersistPresentationTouch(parsed?.lastTouchedAt ?? 0)).toBe(
      true,
    );
    const resolved = readThreadPresentationStateFromStorage({
      hasCollapsedMigrationMarker: false,
      storedValue: JSON.stringify({
        version: THREAD_PRESENTATION_STATE_VERSION,
        mode: "work",
        activeEligibleTabId: null,
        recencyTabIds: [],
      }),
      legacyCollapsedStoredValue: null,
    });
    expect(resolved.persistTouch).toBe(true);
    const touched = touchThreadPresentationState(resolved.state, now);
    expect(touched.lastTouchedAt).toBe(now);
    expect(
      shouldPruneThreadPresentationState({
        now: now + THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS + 1,
        state: touched,
        threadId: "thr-old",
      }),
    ).toBe(true);
    expect(
      shouldPruneThreadPresentationState({
        now,
        state: touched,
        threadId: "thr-old",
      }),
    ).toBe(false);
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

  it("prunes only expired presentation records and leaves collapse keys alone", () => {
    const now = 1_700_000_000_000;
    const mountedThreadId = "thr-mounted";
    const recentThreadId = "thr-recent";
    const expiredThreadId = "thr-expired";
    const unknownAgeThreadId = "thr-unknown";

    window.localStorage.setItem(
      getThreadPresentationStateStorageKey({ threadId: mountedThreadId }),
      serializeThreadPresentationState(
        presentation({
          mode: "work",
          lastTouchedAt: now - THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS - 1,
        }),
      ),
    );
    window.localStorage.setItem(
      getThreadPresentationStateStorageKey({ threadId: recentThreadId }),
      serializeThreadPresentationState(
        presentation({ mode: "work", lastTouchedAt: now }),
      ),
    );
    window.localStorage.setItem(
      getThreadPresentationStateStorageKey({ threadId: expiredThreadId }),
      serializeThreadPresentationState(
        presentation({
          mode: "conversation",
          lastTouchedAt: now - THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS - 1,
        }),
      ),
    );
    window.localStorage.setItem(
      getThreadConversationCollapsedStorageKey({ threadId: expiredThreadId }),
      "true",
    );
    window.localStorage.setItem(
      getThreadPresentationStateStorageKey({ threadId: unknownAgeThreadId }),
      serializeThreadPresentationState(
        presentation({ mode: "work", lastTouchedAt: 0 }),
      ),
    );

    expect(
      shouldPruneThreadPresentationState({
        now,
        retainThreadId: mountedThreadId,
        state: presentation({
          mode: "work",
          lastTouchedAt: now - THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS - 1,
        }),
        threadId: mountedThreadId,
      }),
    ).toBe(false);
    expect(
      shouldPruneThreadPresentationState({
        now,
        state: presentation({ mode: "work", lastTouchedAt: now }),
        threadId: recentThreadId,
      }),
    ).toBe(false);
    expect(
      shouldPruneThreadPresentationState({
        now,
        state: presentation({
          mode: "conversation",
          lastTouchedAt: now - THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS - 1,
        }),
        threadId: expiredThreadId,
      }),
    ).toBe(true);

    pruneThreadPresentationStateStorage({
      now,
      retainThreadId: mountedThreadId,
    });

    expect(
      window.localStorage.getItem(
        getThreadPresentationStateStorageKey({ threadId: mountedThreadId }),
      ),
    ).not.toBeNull();
    expect(
      window.localStorage.getItem(
        getThreadPresentationStateStorageKey({ threadId: recentThreadId }),
      ),
    ).not.toBeNull();
    expect(
      window.localStorage.getItem(
        getThreadPresentationStateStorageKey({ threadId: expiredThreadId }),
      ),
    ).toBeNull();
    expect(
      window.localStorage.getItem(
        getThreadConversationCollapsedStorageKey({ threadId: expiredThreadId }),
      ),
    ).toBe("true");
    expect(
      window.localStorage.getItem(
        getThreadPresentationStateStorageKey({ threadId: unknownAgeThreadId }),
      ),
    ).not.toBeNull();
  });

  it("stays in Conversation after a later collapse, presentation expiry, and re-read", () => {
    const now = 1_700_000_000_000;
    const threadId = "thr-reseed";
    const firstRead = readThreadPresentationStateFromStorage({
      hasCollapsedMigrationMarker: false,
      storedValue: null,
      legacyCollapsedStoredValue: null,
    });
    expect(firstRead.persistMigratedValue).toBe(true);
    expect(firstRead.state.mode).toBe("conversation");

    window.localStorage.setItem(
      getThreadPresentationStateStorageKey({ threadId }),
      serializeThreadPresentationState(
        presentation({
          mode: firstRead.state.mode,
          lastTouchedAt: now - THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS - 1,
        }),
      ),
    );
    window.localStorage.setItem(
      getThreadPresentationCollapsedMigrationMarkerKey({ threadId }),
      "true",
    );
    window.localStorage.setItem(
      getThreadConversationCollapsedStorageKey({ threadId }),
      "true",
    );

    pruneThreadPresentationStateStorage({ now });

    expect(
      window.localStorage.getItem(
        getThreadPresentationStateStorageKey({ threadId }),
      ),
    ).toBeNull();
    expect(
      window.localStorage.getItem(
        getThreadConversationCollapsedStorageKey({ threadId }),
      ),
    ).toBe("true");
    expect(
      window.localStorage.getItem(
        getThreadPresentationCollapsedMigrationMarkerKey({ threadId }),
      ),
    ).toBe("true");
    expect(
      readThreadPresentationStateFromStorage({
        hasCollapsedMigrationMarker: true,
        storedValue: null,
        legacyCollapsedStoredValue: "true",
      }).state.mode,
    ).toBe("conversation");
  });

  it("removes a marker when its presentation key is pruned and no collapsed key remains", () => {
    const now = 1_700_000_000_000;
    const threadId = "thr-prune-marker";
    window.localStorage.setItem(
      getThreadPresentationStateStorageKey({ threadId }),
      serializeThreadPresentationState(
        presentation({
          mode: "work",
          lastTouchedAt: now - THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS - 1,
        }),
      ),
    );
    window.localStorage.setItem(
      getThreadPresentationCollapsedMigrationMarkerKey({ threadId }),
      "true",
    );

    pruneThreadPresentationStateStorage({ now });

    expect(
      window.localStorage.getItem(
        getThreadPresentationStateStorageKey({ threadId }),
      ),
    ).toBeNull();
    expect(
      window.localStorage.getItem(
        getThreadPresentationCollapsedMigrationMarkerKey({ threadId }),
      ),
    ).toBeNull();
  });

  it("removes an orphan marker with no presentation key and no collapsed key", () => {
    const threadId = "thr-orphan-marker";
    window.localStorage.setItem(
      getThreadPresentationCollapsedMigrationMarkerKey({ threadId }),
      "true",
    );

    expect(
      shouldRemovePresentationMigrationMarker({
        hasCollapsedKey: false,
        hasPresentationKey: false,
        threadId,
      }),
    ).toBe(true);

    pruneThreadPresentationStateStorage({ now: 1_700_000_000_000 });

    expect(
      window.localStorage.getItem(
        getThreadPresentationCollapsedMigrationMarkerKey({ threadId }),
      ),
    ).toBeNull();
  });

  it("keeps a marker when a collapsed key still exists so re-seeding stays blocked", () => {
    const now = 1_700_000_000_000;
    const threadId = "thr-keep-marker";
    window.localStorage.setItem(
      getThreadPresentationStateStorageKey({ threadId }),
      serializeThreadPresentationState(
        presentation({
          mode: "conversation",
          lastTouchedAt: now - THREAD_PRESENTATION_STATE_IDLE_EXPIRY_MS - 1,
        }),
      ),
    );
    window.localStorage.setItem(
      getThreadPresentationCollapsedMigrationMarkerKey({ threadId }),
      "true",
    );
    window.localStorage.setItem(
      getThreadConversationCollapsedStorageKey({ threadId }),
      "true",
    );

    expect(
      shouldRemovePresentationMigrationMarker({
        hasCollapsedKey: true,
        hasPresentationKey: false,
        threadId,
      }),
    ).toBe(false);

    pruneThreadPresentationStateStorage({ now });

    expect(
      window.localStorage.getItem(
        getThreadPresentationStateStorageKey({ threadId }),
      ),
    ).toBeNull();
    expect(
      window.localStorage.getItem(
        getThreadConversationCollapsedStorageKey({ threadId }),
      ),
    ).toBe("true");
    expect(
      window.localStorage.getItem(
        getThreadPresentationCollapsedMigrationMarkerKey({ threadId }),
      ),
    ).toBe("true");
    expect(
      readThreadPresentationStateFromStorage({
        hasCollapsedMigrationMarker: true,
        storedValue: null,
        legacyCollapsedStoredValue: "true",
      }).state.mode,
    ).toBe("conversation");
  });
});

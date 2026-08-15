import { describe, expect, it } from "vitest";
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
  migrateLegacyCollapsedPresentationState,
  parseConversationRailWidthPercent,
  parseThreadPresentationState,
  resolveStoredThreadPresentationState,
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
});

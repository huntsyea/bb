// @vitest-environment jsdom

import { createStore, type Atom } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONVERSATION_RAIL_WIDTH_STORAGE_KEY,
  getThreadConversationCollapsedAtom,
  getThreadConversationCollapsedStorageKey,
  getThreadPresentationStateAtom,
  getThreadWorkModeAtom,
  getThreadWorkSurfaceRecencyAtom,
  conversationRailWidthPercentAtom,
  secondaryPanelWidthPercentAtom,
} from "./threadSecondaryPanelAtoms";
import {
  DEFAULT_THREAD_PRESENTATION_STATE,
  getThreadPresentationCollapsedMigrationMarkerKey,
  getThreadPresentationStateStorageKey,
  parseThreadPresentationState,
  serializeThreadPresentationState,
} from "@/views/thread-detail/threadPresentationState";
import { DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT } from "@/views/thread-detail/threadWorkMode";

afterEach(() => {
  window.localStorage.clear();
});

function hydrateAtom<Value>(target: Atom<Value>): Value {
  const store = createStore();
  const unsubscribe = store.sub(target, () => {});
  const value = store.get(target);
  unsubscribe();
  return value;
}

function hydrate<T>(read: (store: ReturnType<typeof createStore>) => T): T {
  const store = createStore();
  const value = read(store);
  return value;
}

describe("thread presentation persistence", () => {
  it("reloads mode and the last eligible surface for only that Thread", () => {
    const store = createStore();
    store.set(getThreadWorkModeAtom("thr-a"), () => true);
    store.set(getThreadWorkSurfaceRecencyAtom("thr-a"), () => [
      "tab-docs",
      "tab-file",
    ]);
    store.set(getThreadWorkModeAtom("thr-b"), () => false);
    store.set(getThreadWorkSurfaceRecencyAtom("thr-b"), () => ["tab-other"]);

    expect(
      parseThreadPresentationState(
        window.localStorage.getItem(
          getThreadPresentationStateStorageKey({ threadId: "thr-a" }),
        ),
      ),
    ).toMatchObject({
      mode: "work",
      activeEligibleTabId: "tab-docs",
      recencyTabIds: ["tab-docs", "tab-file"],
    });
    expect(
      parseThreadPresentationState(
        window.localStorage.getItem(
          getThreadPresentationStateStorageKey({ threadId: "thr-b" }),
        ),
      ),
    ).toMatchObject({
      recencyTabIds: ["tab-other"],
      activeEligibleTabId: "tab-other",
      mode: "conversation",
    });

    expect(hydrateAtom(getThreadWorkModeAtom("thr-a"))).toBe(true);
    expect(hydrateAtom(getThreadWorkSurfaceRecencyAtom("thr-a"))).toEqual([
      "tab-docs",
      "tab-file",
    ]);
    expect(hydrateAtom(getThreadPresentationStateAtom("thr-a"))).toMatchObject({
      mode: "work",
      activeEligibleTabId: "tab-docs",
      recencyTabIds: ["tab-docs", "tab-file"],
    });
    expect(hydrateAtom(getThreadWorkModeAtom("thr-b"))).toBe(false);
    expect(hydrateAtom(getThreadWorkSurfaceRecencyAtom("thr-b"))).toEqual([
      "tab-other",
    ]);
    expect(hydrateAtom(getThreadPresentationStateAtom("thr-b")).mode).toBe(
      "conversation",
    );
  });

  it("migrates a legacy collapsed Thread to Work mode and leaves other Threads alone", () => {
    window.localStorage.setItem(
      getThreadConversationCollapsedStorageKey({ threadId: "thr-legacy" }),
      "true",
    );
    window.localStorage.setItem(
      getThreadConversationCollapsedStorageKey({ threadId: "thr-other" }),
      "false",
    );

    expect(
      hydrate((store) => store.get(getThreadWorkModeAtom("thr-legacy"))),
    ).toBe(true);
    expect(
      parseThreadPresentationState(
        window.localStorage.getItem(
          getThreadPresentationStateStorageKey({ threadId: "thr-legacy" }),
        ),
      ),
    ).toMatchObject({
      mode: "work",
    });
    expect(
      window.localStorage.getItem(
        getThreadConversationCollapsedStorageKey({ threadId: "thr-legacy" }),
      ),
    ).toBe("true");
    expect(
      window.localStorage.getItem(
        getThreadPresentationCollapsedMigrationMarkerKey({
          threadId: "thr-legacy",
        }),
      ),
    ).toBe("true");
    expect(
      hydrate((store) => store.get(getThreadWorkModeAtom("thr-other"))),
    ).toBe(false);
    expect(
      parseThreadPresentationState(
        window.localStorage.getItem(
          getThreadPresentationStateStorageKey({ threadId: "thr-other" }),
        ),
      ),
    ).toMatchObject({
      mode: "conversation",
    });
    expect(
      window.localStorage.getItem(
        getThreadConversationCollapsedStorageKey({ threadId: "thr-other" }),
      ),
    ).toBe("false");
    expect(
      hydrate((store) =>
        store.get(getThreadPresentationStateAtom("thr-missing")),
      ),
    ).toEqual(DEFAULT_THREAD_PRESENTATION_STATE);

    window.localStorage.setItem(
      getThreadConversationCollapsedStorageKey({ threadId: "thr-other" }),
      "true",
    );
    expect(
      hydrate((store) => store.get(getThreadWorkModeAtom("thr-other"))),
    ).toBe(false);
  });

  it("keeps a hosted collapse preference after presentation migration and reload", () => {
    window.localStorage.setItem(
      getThreadConversationCollapsedStorageKey({ threadId: "thr-hosted" }),
      "true",
    );

    expect(
      hydrate((store) =>
        store.get(getThreadPresentationStateAtom("thr-hosted")),
      ).mode,
    ).toBe("work");
    expect(
      window.localStorage.getItem(
        getThreadConversationCollapsedStorageKey({ threadId: "thr-hosted" }),
      ),
    ).toBe("true");
    expect(
      hydrate((store) =>
        store.get(getThreadConversationCollapsedAtom("thr-hosted")),
      ),
    ).toBe(true);
  });

  it("does not let a stored presentation leak into another Thread on switch", () => {
    window.localStorage.setItem(
      getThreadPresentationStateStorageKey({ threadId: "thr-source" }),
      serializeThreadPresentationState({
        ...DEFAULT_THREAD_PRESENTATION_STATE,
        mode: "work",
        activeEligibleTabId: "tab-source",
        recencyTabIds: ["tab-source"],
      }),
    );

    const store = createStore();
    expect(store.get(getThreadPresentationStateAtom("thr-source")).mode).toBe(
      "work",
    );
    expect(
      store.get(getThreadPresentationStateAtom("thr-destination")),
    ).toEqual(DEFAULT_THREAD_PRESENTATION_STATE);
    expect(store.get(getThreadWorkModeAtom("thr-destination"))).toBe(false);
    expect(
      store.get(getThreadWorkSurfaceRecencyAtom("thr-destination")),
    ).toEqual([]);
  });

  it("persists one client-wide rail width independently from the secondary panel", () => {
    const store = createStore();
    store.set(secondaryPanelWidthPercentAtom, 55);
    store.set(conversationRailWidthPercentAtom, 42);

    expect(
      window.localStorage.getItem(CONVERSATION_RAIL_WIDTH_STORAGE_KEY),
    ).toBe("42");
    expect(
      window.localStorage.getItem("bb.thread.secondaryPanel.widthPercent"),
    ).toBe("55");

    expect(hydrateAtom(conversationRailWidthPercentAtom)).toBe(42);
    expect(hydrateAtom(secondaryPanelWidthPercentAtom)).toBe(55);
    expect(hydrateAtom(conversationRailWidthPercentAtom)).not.toBe(
      hydrateAtom(secondaryPanelWidthPercentAtom),
    );
    expect(hydrateAtom(conversationRailWidthPercentAtom)).not.toBe(
      DEFAULT_CONVERSATION_RAIL_WIDTH_PERCENT,
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  createBrowserFixedPanelTab,
  createGitDiffFixedPanelTab,
  createHostFilePreviewFixedPanelTab,
  createNewTabFixedPanelTab,
  createPluginPanelFixedPanelTab,
  createTerminalFixedPanelTab,
  createThreadInfoFixedPanelTab,
  createThreadStorageFilePreviewFixedPanelTab,
  createWorkspaceFilePreviewFixedPanelTab,
  type FixedPanelTab,
} from "@/lib/fixed-panel-tabs-state";
import {
  SIDE_CHAT_PLUGIN_ID,
  SIDE_CHAT_PLUGIN_PANEL_ACTION_ID,
} from "@/lib/side-chat-plugin";
import {
  hasEligibleWorkSurface,
  isEligibleWorkSurface,
  reconcileThreadWorkModeSurfaces,
  resolveLiveThreadWorkModeSurfaces,
  recordEligibleWorkSurfaceRecency,
  resolveEnterThreadWorkMode,
  resolveWorkSurfaceSnapshotForThread,
  selectMostRecentlyUsedEligibleWorkSurface,
} from "./workSurfaceEligibility";

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

function hostFile(path: string): FixedPanelTab {
  return createHostFilePreviewFixedPanelTab({
    environmentId: "env-1",
    tab: { lineRange: null, path },
    threadId: "thr-1",
  });
}

function storageFile(path: string): FixedPanelTab {
  return createThreadStorageFilePreviewFixedPanelTab({
    environmentId: "env-1",
    isPinned: false,
    tab: { lineRange: null, path },
    threadId: "thr-1",
  });
}

function pluginPanel(args: {
  actionId: string;
  pluginId: string;
  title: string;
}): FixedPanelTab {
  return createPluginPanelFixedPanelTab({
    actionId: args.actionId,
    paramsJson: null,
    pluginId: args.pluginId,
    title: args.title,
  });
}

const EVERY_FIXED_TAB_KIND: readonly FixedPanelTab[] = [
  createThreadInfoFixedPanelTab(),
  createGitDiffFixedPanelTab(),
  workspaceFile("src/index.ts"),
  hostFile("/tmp/notes.md"),
  storageFile("artifact.txt"),
  createBrowserFixedPanelTab({ environmentId: "env-1", url: "https://bb.dev" }),
  createNewTabFixedPanelTab(),
  createTerminalFixedPanelTab({ terminalId: "term-1" }),
  pluginPanel({
    actionId: "open-doc",
    pluginId: "docs",
    title: "Notes",
  }),
];

describe("workSurfaceEligibility", () => {
  it("accepts every content-bearing fixed tab kind and excludes Thread information and New tab", () => {
    const byKind = Object.fromEntries(
      EVERY_FIXED_TAB_KIND.map((tab) => [tab.kind, isEligibleWorkSurface(tab)]),
    );

    expect(byKind).toEqual({
      "thread-info": false,
      "git-diff": true,
      "workspace-file-preview": true,
      "host-file-preview": true,
      "thread-storage-file-preview": true,
      browser: true,
      "new-tab": false,
      terminal: true,
      "plugin-panel": true,
    });
    expect(EVERY_FIXED_TAB_KIND.map((tab) => tab.kind).sort()).toEqual(
      [
        "browser",
        "git-diff",
        "host-file-preview",
        "new-tab",
        "plugin-panel",
        "terminal",
        "thread-info",
        "thread-storage-file-preview",
        "workspace-file-preview",
      ].sort(),
    );
  });

  it("treats Docs and Side chat as ordinary plugin panels with no extra field", () => {
    const docs = pluginPanel({
      actionId: "open-doc",
      pluginId: "docs",
      title: "Spec",
    });
    const sideChat = pluginPanel({
      actionId: SIDE_CHAT_PLUGIN_PANEL_ACTION_ID,
      pluginId: SIDE_CHAT_PLUGIN_ID,
      title: "Side chat",
    });
    const unknown = pluginPanel({
      actionId: "board",
      pluginId: "removed-plugin",
      title: "Gone",
    });

    expect(docs).not.toHaveProperty("workMode");
    expect(docs).not.toHaveProperty("eligible");
    expect(isEligibleWorkSurface(docs)).toBe(true);
    expect(isEligibleWorkSurface(sideChat)).toBe(true);
    expect(isEligibleWorkSurface(unknown)).toBe(true);
    expect(
      hasEligibleWorkSurface([createThreadInfoFixedPanelTab(), docs]),
    ).toBe(true);
  });

  it("selects the most recently used remaining eligible surface", () => {
    const diff = createGitDiffFixedPanelTab();
    const fileA = workspaceFile("a.ts");
    const fileB = workspaceFile("b.ts");
    const terminal = createTerminalFixedPanelTab({ terminalId: "term-1" });
    const docs = pluginPanel({
      actionId: "open-doc",
      pluginId: "docs",
      title: "Spec",
    });
    const newTab = createNewTabFixedPanelTab();
    const info = createThreadInfoFixedPanelTab();
    const tabs = [info, diff, fileA, fileB, terminal, docs, newTab];
    const recencyTabIds = recordEligibleWorkSurfaceRecency(
      recordEligibleWorkSurfaceRecency(
        recordEligibleWorkSurfaceRecency([fileA.id], terminal.id),
        docs.id,
      ),
      fileB.id,
    );

    expect(
      selectMostRecentlyUsedEligibleWorkSurface({
        recencyTabIds,
        tabs,
        excludeTabId: fileB.id,
      })?.id,
    ).toBe(docs.id);
    expect(
      selectMostRecentlyUsedEligibleWorkSurface({
        recencyTabIds,
        tabs: [info, fileA, newTab],
      })?.id,
    ).toBe(fileA.id);
    expect(
      selectMostRecentlyUsedEligibleWorkSurface({
        recencyTabIds: [],
        tabs: [info, fileA, fileB],
      })?.id,
    ).toBe(fileB.id);
    expect(
      selectMostRecentlyUsedEligibleWorkSurface({
        recencyTabIds,
        tabs: [info, newTab],
      }),
    ).toBeNull();

    const alreadyFirst = [fileB.id, fileA.id];
    expect(recordEligibleWorkSurfaceRecency(alreadyFirst, fileB.id)).toBe(
      alreadyFirst,
    );
  });

  it("enters Work mode on the current eligible tab or the most recently used fallback", () => {
    const fileA = workspaceFile("a.ts");
    const fileB = workspaceFile("b.ts");
    const info = createThreadInfoFixedPanelTab();
    const newTab = createNewTabFixedPanelTab();

    expect(
      resolveEnterThreadWorkMode({
        activeTabId: fileB.id,
        recencyTabIds: [fileA.id, fileB.id],
        tabs: [info, fileA, fileB],
      }),
    ).toEqual({ activeTabId: fileB.id, canEnter: true });
    expect(
      resolveEnterThreadWorkMode({
        activeTabId: info.id,
        recencyTabIds: [fileA.id, fileB.id],
        tabs: [info, fileA, fileB],
      }),
    ).toEqual({ activeTabId: fileA.id, canEnter: true });
    expect(
      resolveEnterThreadWorkMode({
        activeTabId: newTab.id,
        recencyTabIds: [],
        tabs: [info, newTab],
      }),
    ).toEqual({ activeTabId: newTab.id, canEnter: false });
    expect(
      Object.keys(
        resolveEnterThreadWorkMode({
          activeTabId: fileA.id,
          recencyTabIds: [],
          tabs: [fileA],
        }),
      ).sort(),
    ).toEqual(["activeTabId", "canEnter"]);
  });

  it("keeps a newly opened eligible surface and does not remount by changing the prior tab", () => {
    const fileA = workspaceFile("a.ts");
    const browser = createBrowserFixedPanelTab({
      environmentId: "env-1",
      url: "https://bb.dev",
    });
    const info = createThreadInfoFixedPanelTab();

    expect(
      reconcileThreadWorkModeSurfaces({
        activeTabId: browser.id,
        isWorkMode: true,
        previousActiveTabId: fileA.id,
        previousWasEligible: true,
        recencyTabIds: [browser.id, fileA.id],
        tabs: [info, fileA, browser],
      }),
    ).toEqual({ activeTabId: browser.id, kind: "keep" });
  });

  it("does not treat a Thread switch as losing the previous eligible surface", () => {
    const fileOnA = workspaceFile("a.ts");
    const fileOnB = workspaceFile("other.ts");
    const newTab = createNewTabFixedPanelTab();
    const resolved = resolveWorkSurfaceSnapshotForThread({
      activeTab: newTab,
      snapshot: {
        activeTabId: fileOnA.id,
        threadId: "thr-a",
        wasEligible: true,
      },
      threadId: "thr-b",
    });

    expect(resolved.didReset).toBe(true);
    expect(resolved.snapshot).toEqual({
      activeTabId: newTab.id,
      threadId: "thr-b",
      wasEligible: false,
    });
    expect(
      reconcileThreadWorkModeSurfaces({
        activeTabId: newTab.id,
        isWorkMode: true,
        previousActiveTabId: resolved.snapshot.activeTabId,
        previousWasEligible: resolved.snapshot.wasEligible,
        recencyTabIds: [fileOnB.id],
        tabs: [newTab, fileOnB],
      }),
    ).toEqual({ activeTabId: newTab.id, kind: "keep" });
  });

  it("keeps New tab visible in Work mode while another eligible surface remains", () => {
    const fileA = workspaceFile("a.ts");
    const newTab = createNewTabFixedPanelTab();

    expect(
      reconcileThreadWorkModeSurfaces({
        activeTabId: newTab.id,
        isWorkMode: true,
        previousActiveTabId: fileA.id,
        previousWasEligible: true,
        recencyTabIds: [fileA.id],
        tabs: [fileA, newTab],
      }),
    ).toEqual({ activeTabId: newTab.id, kind: "keep" });
  });

  it("promotes a file that replaces the New tab launcher", () => {
    const fileA = workspaceFile("a.ts");
    const fileB = workspaceFile("b.ts");
    const newTab = createNewTabFixedPanelTab();

    expect(
      reconcileThreadWorkModeSurfaces({
        activeTabId: fileB.id,
        isWorkMode: true,
        previousActiveTabId: newTab.id,
        previousWasEligible: false,
        recencyTabIds: [fileA.id],
        tabs: [fileA, fileB],
      }),
    ).toEqual({ activeTabId: fileB.id, kind: "keep" });
  });

  it("falls back to the most recently used eligible surface when the active one is lost", () => {
    const fileA = workspaceFile("a.ts");
    const fileB = workspaceFile("b.ts");
    const fileC = workspaceFile("c.ts");
    const docs = pluginPanel({
      actionId: "open-doc",
      pluginId: "docs",
      title: "Spec",
    });
    const info = createThreadInfoFixedPanelTab();

    expect(
      reconcileThreadWorkModeSurfaces({
        activeTabId: fileB.id,
        isWorkMode: true,
        previousActiveTabId: fileC.id,
        previousWasEligible: true,
        recencyTabIds: [fileC.id, docs.id, fileA.id, fileB.id],
        tabs: [info, fileA, fileB, docs],
      }),
    ).toEqual({ activeTabId: docs.id, kind: "activate" });
  });

  it("exits Work mode when the last eligible surface disappears", () => {
    const fileA = workspaceFile("a.ts");
    const info = createThreadInfoFixedPanelTab();
    const newTab = createNewTabFixedPanelTab();

    expect(
      reconcileThreadWorkModeSurfaces({
        activeTabId: newTab.id,
        isWorkMode: true,
        previousActiveTabId: fileA.id,
        previousWasEligible: true,
        recencyTabIds: [fileA.id],
        tabs: [info, newTab],
      }),
    ).toEqual({ kind: "exit" });
    expect(
      reconcileThreadWorkModeSurfaces({
        activeTabId: info.id,
        isWorkMode: false,
        previousActiveTabId: fileA.id,
        previousWasEligible: true,
        recencyTabIds: [fileA.id],
        tabs: [info],
      }),
    ).toEqual({ activeTabId: info.id, kind: "keep" });
  });

  it("does not activate a fallback surface when Work mode cannot be entered", () => {
    const fileA = workspaceFile("a.ts");
    const fileB = workspaceFile("b.ts");
    const newTab = createNewTabFixedPanelTab();

    expect(
      resolveLiveThreadWorkModeSurfaces({
        activeTabId: newTab.id,
        canEnterWorkMode: false,
        isWorkMode: true,
        previousActiveTabId: "closed-file",
        previousWasEligible: true,
        recencyTabIds: [fileB.id, fileA.id],
        tabs: [fileA, fileB, newTab],
      }),
    ).toEqual({ kind: "skip" });
    expect(
      resolveLiveThreadWorkModeSurfaces({
        activeTabId: newTab.id,
        canEnterWorkMode: true,
        isWorkMode: true,
        previousActiveTabId: "closed-file",
        previousWasEligible: true,
        recencyTabIds: [fileB.id, fileA.id],
        tabs: [fileA, fileB, newTab],
      }),
    ).toEqual({ activeTabId: fileB.id, kind: "activate" });
  });
});

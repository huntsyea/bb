import {
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Panel,
  PanelGroup,
  type ImperativePanelGroupHandle,
} from "react-resizable-panels";
import { ResponsiveDrawerShell } from "@bb/shared-ui/responsive-overlay";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import { Skeleton } from "@bb/shared-ui/skeleton";
import { DETAIL_GRID_CLASS } from "@/components/ui/detail-card.js";
import { useAtomValue, useSetAtom } from "jotai";
import { cn } from "@bb/shared-ui/lib/utils";
import { ThreadSecondaryPanel } from "@/components/secondary-panel/ThreadSecondaryPanel";
import { useDrawerPanelRealization } from "@/components/secondary-panel/useDrawerPanelRealization";
import {
  conversationRailWidthPercentAtom,
  secondaryPanelWidthPercentAtom,
  threadSecondaryPanelResizingAtom,
} from "@/components/secondary-panel/threadSecondaryPanelAtoms";
import {
  CONVERSATION_RAIL_MIN_SIZE_PERCENT,
  constrainConversationRailWidthPercent,
  resolveConversationRailWidthUpdate,
  resolveThreadWorkModeLayoutSizes,
} from "./threadWorkMode";
import {
  ThreadMetadataCard,
  ThreadMetadataContent,
  hasAnyThreadMetadata,
  type ThreadMetadataContentProps,
} from "@/components/secondary-panel/ThreadMetadataContent";
import { useThreads } from "@/hooks/queries/thread-queries";
import { ThreadTimelinePane } from "./ThreadTimelinePane";
import { PANEL_COLLAPSE_TRANSITION_CLASS } from "@/components/secondary-panel/panelTransitionTokens";
import { dispatchBrowserViewBoundsSync } from "@/lib/browser-view-bounds-sync";
import {
  usePaneContext,
  usePaneSecondaryPanelRegistration,
  type PaneSecondaryPanelViewModel,
} from "./PaneContext";
import {
  PluginComposerHostScopeProvider,
  usePluginComposerHost,
} from "@/components/plugin/plugin-composer-host";
import {
  ThreadSurfaceHost,
  type ThreadSurfaceArrangement,
} from "./ThreadSurfaceHost";

const CLOSED_TIMELINE_PANEL_SIZE_PERCENT = 100;
const COLLAPSED_TIMELINE_PANEL_SIZE_PERCENT = 0;
const TIMELINE_PANEL_MIN_SIZE_PERCENT = 30;

type ThreadTimelinePaneProps = Omit<
  ComponentProps<typeof ThreadTimelinePane>,
  "footer"
>;
type ThreadSecondaryPanelProps = Omit<
  ComponentProps<typeof ThreadSecondaryPanel>,
  | "metadataContent"
  | "renderAsDrawer"
  | "isConversationCollapsed"
  | "onToggleConversationCollapse"
  | "isWorkMode"
  | "onToggleWorkMode"
  | "browserDeck"
> & {
  renderBrowserDeck?: (args: {
    canShowNativeBrowserView: boolean;
  }) => ReactNode;
};

interface ThreadDetailSecondaryContentProps {
  footer: ReactNode;
  header: ReactNode;
  isMetadataLoading: boolean;
  isSecondaryPanelOpen: boolean;
  isConversationCollapsed: boolean;
  isWorkMode: boolean;
  /**
   * True when rendering inside a bounded split card. Bounded panes skip the
   * page-bleed negative margins below — the card supplies the boundary, so
   * bleeding out of it only gets clipped by the card's overflow-hidden (and
   * leaves a dead band at the bottom, since negative margins shift content
   * without stretching it).
   */
  isBoundedPane: boolean;
  onToggleSecondaryPanel: () => void;
  onToggleConversationCollapse: () => void;
  onToggleWorkMode: () => void;
  renderHostedPanel: (panel: ReactNode) => ReactNode;
  metadata: ThreadMetadataContentProps;
  secondaryPanel: ThreadSecondaryPanelProps;
  surfaceArrangement: ThreadSurfaceArrangement;
  timeline: ThreadTimelinePaneProps;
}

export function ThreadDetailSecondaryContent(
  props: ThreadDetailSecondaryContentProps,
) {
  return (
    <PluginComposerHostScopeProvider>
      <ThreadDetailSecondaryContentBody {...props} />
    </PluginComposerHostScopeProvider>
  );
}

function ThreadDetailSecondaryContentBody({
  footer,
  header,
  isMetadataLoading,
  isSecondaryPanelOpen,
  isConversationCollapsed,
  isWorkMode,
  isBoundedPane,
  onToggleSecondaryPanel,
  onToggleConversationCollapse,
  onToggleWorkMode,
  renderHostedPanel,
  metadata,
  secondaryPanel,
  surfaceArrangement,
  timeline,
}: ThreadDetailSecondaryContentProps) {
  const { isFocused, paneId, secondaryPanelHost } = usePaneContext();
  const composerHost = usePluginComposerHost();
  const stableMetadata = metadata;
  const stableSecondaryPanel = secondaryPanel;
  const stableTimeline = timeline;
  const renderAsDrawer = useIsCompactViewport();
  const persistedSecondaryWidthPercent = useAtomValue(
    secondaryPanelWidthPercentAtom,
  );
  const conversationRailWidthPercent = useAtomValue(
    conversationRailWidthPercentAtom,
  );
  const setConversationRailWidthPercent = useSetAtom(
    conversationRailWidthPercentAtom,
  );
  const isSecondaryPanelResizing = useAtomValue(
    threadSecondaryPanelResizingAtom,
  );
  const isStandaloneWideLayout = secondaryPanelHost === null && !renderAsDrawer;
  // `isWorkMode` already carries the caller's eligibility gate, which for a
  // hosted pane includes holding the whole workspace. A hosted pane that
  // reaches this point therefore renders the same work-surface-primary layout
  // as the standalone surface — the conversation rail exists once, in the
  // maximized pane, never in every visible split pane.
  const isWorkModeActive =
    isWorkMode && isSecondaryPanelOpen && !renderAsDrawer;
  // Conversation collapse is the hosted-pane fallback for panes that have no
  // Work mode to offer. Work mode supersedes it wherever it is active.
  const canCollapseConversation =
    !isStandaloneWideLayout &&
    !isWorkModeActive &&
    isSecondaryPanelOpen &&
    !renderAsDrawer;
  const isConversationCollapsedActive =
    canCollapseConversation && isConversationCollapsed;
  const layoutSizes = resolveThreadWorkModeLayoutSizes({
    isWorkMode: isWorkModeActive,
    isSecondaryPanelOpen: isSecondaryPanelOpen && !renderAsDrawer,
    conversationRailWidthPercent,
    secondaryPanelWidthPercent: persistedSecondaryWidthPercent,
  });
  const [isCompactDrawerContentSettled, setIsCompactDrawerContentSettled] =
    useState(false);
  const { isPanelRealized, realizePanel } = useDrawerPanelRealization({
    isDrawerOpen: isSecondaryPanelOpen,
    rendersAsDrawer: renderAsDrawer,
  });
  const compactDrawerContentSettleFrameRef = useRef<number | null>(null);
  const compactDrawerContentSettleGenerationRef = useRef(0);
  const compactDrawerContentSettleStateRef = useRef({
    isSecondaryPanelOpen,
    renderAsDrawer,
    threadId: stableTimeline.threadId,
  });

  useLayoutEffect(() => {
    compactDrawerContentSettleStateRef.current = {
      isSecondaryPanelOpen,
      renderAsDrawer,
      threadId: stableTimeline.threadId,
    };
  }, [isSecondaryPanelOpen, renderAsDrawer, stableTimeline.threadId]);

  const cancelCompactDrawerContentSettleFrame = useCallback(() => {
    compactDrawerContentSettleGenerationRef.current += 1;
    if (compactDrawerContentSettleFrameRef.current === null) {
      return;
    }
    window.cancelAnimationFrame(compactDrawerContentSettleFrameRef.current);
    compactDrawerContentSettleFrameRef.current = null;
  }, []);

  useLayoutEffect(() => {
    cancelCompactDrawerContentSettleFrame();
    setIsCompactDrawerContentSettled(false);
  }, [
    cancelCompactDrawerContentSettleFrame,
    isSecondaryPanelOpen,
    renderAsDrawer,
    stableTimeline.threadId,
  ]);

  useLayoutEffect(
    () => () => {
      cancelCompactDrawerContentSettleFrame();
    },
    [cancelCompactDrawerContentSettleFrame],
  );

  const handleDrawerContentAnimationEnd = useCallback(
    (open: boolean) => {
      if (!open) {
        return;
      }
      const currentState = compactDrawerContentSettleStateRef.current;
      if (!currentState.isSecondaryPanelOpen || !currentState.renderAsDrawer) {
        return;
      }

      cancelCompactDrawerContentSettleFrame();
      const requestGeneration = compactDrawerContentSettleGenerationRef.current;
      const requestThreadId = currentState.threadId;
      compactDrawerContentSettleFrameRef.current = window.requestAnimationFrame(
        () => {
          compactDrawerContentSettleFrameRef.current = null;
          const latestState = compactDrawerContentSettleStateRef.current;
          if (
            compactDrawerContentSettleGenerationRef.current !==
              requestGeneration ||
            latestState.threadId !== requestThreadId ||
            !latestState.isSecondaryPanelOpen ||
            !latestState.renderAsDrawer
          ) {
            return;
          }

          dispatchBrowserViewBoundsSync();

          const stateAfterSync = compactDrawerContentSettleStateRef.current;
          if (
            compactDrawerContentSettleGenerationRef.current ===
              requestGeneration &&
            stateAfterSync.threadId === requestThreadId &&
            stateAfterSync.isSecondaryPanelOpen &&
            stateAfterSync.renderAsDrawer
          ) {
            setIsCompactDrawerContentSettled(true);
            realizePanel();
          }
        },
      );
    },
    [cancelCompactDrawerContentSettleFrame, realizePanel],
  );
  const canShowNativeBrowserView = renderAsDrawer
    ? isSecondaryPanelOpen && isCompactDrawerContentSettled
    : isSecondaryPanelOpen && (secondaryPanelHost === null || isFocused);
  const { renderBrowserDeck, ...threadSecondaryPanelProps } =
    stableSecondaryPanel;
  const browserDeck = useMemo(
    () => renderBrowserDeck?.({ canShowNativeBrowserView }),
    [canShowNativeBrowserView, renderBrowserDeck],
  );

  const horizontalPanelGroupRef = useRef<ImperativePanelGroupHandle | null>(
    null,
  );
  // Read inside the collapse layout effect without making width changes
  // re-trigger it (which would fight an in-progress resize drag).
  const persistedSecondaryWidthRef = useRef(persistedSecondaryWidthPercent);
  useEffect(() => {
    persistedSecondaryWidthRef.current = persistedSecondaryWidthPercent;
  }, [persistedSecondaryWidthPercent]);
  const conversationRailWidthRef = useRef(conversationRailWidthPercent);
  useEffect(() => {
    conversationRailWidthRef.current = conversationRailWidthPercent;
  }, [conversationRailWidthPercent]);
  const didMountConversationCollapseRef = useRef(false);
  useLayoutEffect(() => {
    // Initial mount is handled by each panel's defaultSize; only animate when
    // the collapse state changes afterwards. A layout effect keeps the
    // secondary panel's lifted max size and the new layout in the same commit,
    // avoiding a flicker through the clamped 70% intermediate.
    if (!didMountConversationCollapseRef.current) {
      didMountConversationCollapseRef.current = true;
      return;
    }
    const group = horizontalPanelGroupRef.current;
    if (group === null || renderAsDrawer || !isSecondaryPanelOpen) {
      return;
    }
    if (isConversationCollapsedActive) {
      group.setLayout([COLLAPSED_TIMELINE_PANEL_SIZE_PERCENT, 100]);
      return;
    }
    if (isWorkModeActive) {
      const railWidth = constrainConversationRailWidthPercent(
        conversationRailWidthRef.current,
      );
      group.setLayout([100 - railWidth, railWidth]);
      return;
    }
    const secondaryWidth = persistedSecondaryWidthRef.current;
    group.setLayout([100 - secondaryWidth, secondaryWidth]);
  }, [
    isConversationCollapsedActive,
    isSecondaryPanelOpen,
    isWorkModeActive,
    renderAsDrawer,
  ]);

  // Mirror ForksRow's query (deduped by react-query) so the visibility gate
  // accounts for the lazily-fetched Forks row.
  const forksQuery = useThreads({
    projectId: stableMetadata.thread.projectId,
    sourceThreadId: stableMetadata.thread.id,
    originKind: "fork",
    archived: false,
  });
  const hasForks = (forksQuery.data?.length ?? 0) > 0;

  const metadataContent = useMemo(
    () =>
      hasAnyThreadMetadata(stableMetadata, hasForks) ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ThreadMetadataContent {...stableMetadata} />
        </div>
      ) : isMetadataLoading ? (
        <ThreadMetadataLoadingSkeleton />
      ) : (
        <div className="px-4 pt-1 text-sm text-muted-foreground">
          No thread details available.
        </div>
      ),
    [hasForks, isMetadataLoading, stableMetadata],
  );
  // A hosted pane with no eligible work surface keeps the conversation-collapse
  // control: swapping in a permanently disabled Work mode control there would
  // take away a working affordance. The standalone surface has no collapse
  // fallback, so it always shows the Work mode control.
  const showsWorkModeControl =
    !renderAsDrawer &&
    (isStandaloneWideLayout || threadSecondaryPanelProps.canEnterWorkMode);
  const inlineSecondaryPanelContent = useMemo(
    () =>
      !renderAsDrawer ? (
        <ThreadSecondaryPanel
          {...threadSecondaryPanelProps}
          browserDeck={browserDeck}
          renderAsDrawer={false}
          isConversationCollapsed={isConversationCollapsedActive}
          onToggleConversationCollapse={onToggleConversationCollapse}
          isWorkMode={isWorkModeActive}
          onToggleWorkMode={showsWorkModeControl ? onToggleWorkMode : undefined}
          // The owning thread or workspace header shows a closed panel. Once
          // open, collapse belongs at the outer edge of the panel toolbar.
          inlinePanelToggle="button"
          // In the split-workspace host, panes' panels share one PanelGroup, so
          // each pane's Panel needs its own layout identity (see the prop doc).
          resizablePanelId={
            secondaryPanelHost === null
              ? undefined
              : `thread-detail-secondary-panel-${paneId}`
          }
          // A hosted panel is a sibling of the split tree inside the window
          // host's PanelGroup. In Work mode it swaps to the primary (left)
          // side, and the split tree — the maximized pane's conversation —
          // becomes the rail. Only the CSS order moves; the React children
          // keep their positions, so nothing remounts.
          resizablePanelLayout={
            secondaryPanelHost !== null && isWorkModeActive
              ? {
                  panelOrder: 1,
                  resizeHandleVisualOrder: 2,
                  visualOrder: 1,
                }
              : undefined
          }
          metadataContent={metadataContent}
        />
      ) : null,
    [
      browserDeck,
      isConversationCollapsedActive,
      isWorkModeActive,
      metadataContent,
      onToggleConversationCollapse,
      onToggleWorkMode,
      paneId,
      renderAsDrawer,
      secondaryPanelHost,
      showsWorkModeControl,
      threadSecondaryPanelProps,
    ],
  );
  const drawerSecondaryPanelContent = renderAsDrawer ? (
    <ThreadSecondaryPanel
      {...threadSecondaryPanelProps}
      browserDeck={browserDeck}
      renderAsDrawer={true}
      isConversationCollapsed={false}
      onToggleConversationCollapse={onToggleConversationCollapse}
      metadataContent={metadataContent}
    />
  ) : null;
  const hostedPanelModel = useMemo<PaneSecondaryPanelViewModel>(
    () => ({
      composerHost,
      contentKey: stableTimeline.threadId,
      isMainCollapsed: isConversationCollapsedActive,
      isOpen: isSecondaryPanelOpen,
      panel: renderHostedPanel(inlineSecondaryPanelContent),
      onToggle: onToggleSecondaryPanel,
    }),
    [
      composerHost,
      inlineSecondaryPanelContent,
      isConversationCollapsedActive,
      isSecondaryPanelOpen,
      onToggleSecondaryPanel,
      renderHostedPanel,
      stableTimeline.threadId,
    ],
  );
  usePaneSecondaryPanelRegistration(secondaryPanelHost, hostedPanelModel);

  if (secondaryPanelHost !== null) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-clip">
        {header}
        <div
          data-conversation-collapsed={isConversationCollapsedActive}
          inert={isConversationCollapsedActive}
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col transition-opacity",
            PANEL_COLLAPSE_TRANSITION_CLASS,
            isConversationCollapsedActive && "opacity-0",
          )}
        >
          <ThreadTimelinePane {...stableTimeline} footer={footer} />
        </div>
      </div>
    );
  }

  return (
    <div
      data-thread-mode={isWorkModeActive ? "work" : "conversation"}
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-clip",
        !isBoundedPane && "-mx-4 -mb-4 -mt-4 md:-mx-5 md:-mb-5 md:-mt-5",
      )}
    >
      {/*
        When collapsed we keep the resizable PanelGroup mounted: the timeline
        lifts to 0% and the panel to 100% via the layout effect. Nothing
        unmounts, so the secondary panel's content (live iframes, parsed diffs,
        scroll position) is never torn down and re-created when toggling
        collapse. The panel header's own toggle restores the conversation.
      */}
      {/* PanelGroup sets an inline `height: 100%`, so it needs this flex-sized
          row to resolve against rather than the column that also holds the
          header. */}
      <div className="flex min-h-0 w-full min-w-0 flex-1">
        <PanelGroup
          // Thread-scoped panel state should mount at its saved size instead of
          // animating from the previously selected thread's layout.
          key={stableTimeline.threadId}
          ref={horizontalPanelGroupRef}
          direction="horizontal"
          // Query container so the secondary panel can hold its content at the
          // panel's open width in cqw and clip it into view instead of
          // reflowing (see ThreadSecondaryPanel swipe mode).
          className="@container h-full min-w-0 flex-1"
          // react-resizable-panels sets an INLINE `overflow: hidden` on the group
          // root, which is still programmatically scrollable. A `scrollIntoView`
          // from the app-preview iframe (clicking an in-page `#anchor`) walks up
          // and bumps this group's `scrollTop`, dragging the whole view out of
          // place. `clip` makes it a non-scroll container.
          style={{ overflow: "clip" }}
        >
          <ThreadSurfaceHost
            arrangement={surfaceArrangement}
            renderConversation={(layout) => (
              <Panel
                id="thread-detail-timeline-panel"
                collapsible={!isWorkModeActive}
                collapsedSize={COLLAPSED_TIMELINE_PANEL_SIZE_PERCENT}
                defaultSize={
                  isConversationCollapsedActive
                    ? COLLAPSED_TIMELINE_PANEL_SIZE_PERCENT
                    : isSecondaryPanelOpen && !renderAsDrawer
                      ? layoutSizes.conversationSizePercent
                      : CLOSED_TIMELINE_PANEL_SIZE_PERCENT
                }
                minSize={
                  isWorkModeActive
                    ? CONVERSATION_RAIL_MIN_SIZE_PERCENT
                    : TIMELINE_PANEL_MIN_SIZE_PERCENT
                }
                onResize={(size) => {
                  const nextWidth = resolveConversationRailWidthUpdate({
                    isWorkMode: isWorkModeActive,
                    isUserResizing: isSecondaryPanelResizing,
                    sizePercent: size,
                  });
                  if (nextWidth !== null) {
                    setConversationRailWidthPercent(nextWidth);
                  }
                }}
                order={layout.panelOrder}
                style={{ order: layout.visualOrder }}
                className={cn(
                  "min-w-0 overflow-clip transition-[flex-grow,flex-basis]",
                  PANEL_COLLAPSE_TRANSITION_CLASS,
                )}
              >
                <div
                  data-thread-region="conversation"
                  data-conversation-collapsed={isConversationCollapsedActive}
                  // `inert` removes the hidden conversation (header, timeline,
                  // composer) from the tab order and a11y tree and blocks pointer
                  // events, so keyboard focus can't land in the invisible pane.
                  inert={isConversationCollapsedActive}
                  className={cn(
                    "flex h-full min-h-0 min-w-0 flex-col transition-opacity",
                    PANEL_COLLAPSE_TRANSITION_CLASS,
                    isConversationCollapsedActive && "opacity-0",
                  )}
                >
                  {header}
                  <ThreadTimelinePane {...stableTimeline} footer={footer} />
                </div>
              </Panel>
            )}
            renderWorkSurface={(layout) =>
              inlineSecondaryPanelContent === null
                ? null
                : cloneElement(inlineSecondaryPanelContent, {
                    resizablePanelLayout: {
                      ...layout,
                      sizePercent: layoutSizes.workSurfaceSizePercent,
                    },
                  })
            }
          />
        </PanelGroup>
      </div>
      {renderAsDrawer ? (
        <ResponsiveDrawerShell
          open={isSecondaryPanelOpen}
          onOpenChange={(open) => {
            if (!open) threadSecondaryPanelProps.onClose();
          }}
          srLabel="Thread details"
          contentClassName="h-[92dvh] max-h-[92dvh]"
          onContentAnimationEnd={handleDrawerContentAnimationEnd}
          // `handleOnly` keeps vaul from binding its pointerdown handler on
          // the drawer body. Without it, vaul calls setPointerCapture on the
          // click target, which captures the pointer on Pierre tree's host
          // element and prevents the click from reaching rows inside the
          // shadow DOM. The drag handle bar still drags the drawer.
          handleOnly
          // This drawer hosts nested picker drawers; Vaul's input repositioning
          // reacts to any focused input, including nested search fields.
          repositionInputs={false}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* The panel mounts after the sheet settles: mounting it inside
                the opening tap costs hundreds of milliseconds of style
                resolution on iOS and freezes the slide-in. */}
            {isPanelRealized ? (
              drawerSecondaryPanelContent
            ) : (
              <ThreadMetadataLoadingSkeleton />
            )}
          </div>
        </ResponsiveDrawerShell>
      ) : null}
    </div>
  );
}

const METADATA_SKELETON_ROW_VALUE_WIDTHS = ["w-40", "w-28", "w-36", "w-24"];

function ThreadMetadataLoadingSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ThreadMetadataCard>
        {METADATA_SKELETON_ROW_VALUE_WIDTHS.map((valueWidth, index) => (
          <div
            key={index}
            className={cn(DETAIL_GRID_CLASS, "items-center py-0.5")}
          >
            <Skeleton className="h-3 w-14 rounded-sm" />
            <Skeleton className={`h-3 ${valueWidth} max-w-full rounded-sm`} />
          </div>
        ))}
      </ThreadMetadataCard>
    </div>
  );
}

export type PanelToggleAction =
  | "show-panel"
  | "enter-work-mode"
  | "restore-conversation"
  | "enter-full-screen"
  | "exit-full-screen";

/**
 * Icon names the toggle can render. A subset of the Icon component's `IconName`
 * union; validity is enforced where the value flows into `<Icon name={…} />`.
 */
export type PanelToggleIconName = "PanelRight" | "Maximize2" | "Minimize2";

interface PanelToggleActionPresentation {
  label: string;
  iconName: PanelToggleIconName;
  /**
   * Whether the action is currently presenting Work mode (or the hosted
   * pane's remaining full-screen collapse). This drives `aria-pressed`.
   */
  isPressed: boolean;
}

/**
 * Shared copy and icons for the conversation-header and in-panel toggles.
 */
const PANEL_TOGGLE_ACTION_PRESENTATION = {
  "show-panel": {
    label: "Show right panel",
    iconName: "PanelRight",
    isPressed: false,
  },
  "enter-work-mode": {
    label: "Enter Work mode",
    iconName: "Maximize2",
    isPressed: false,
  },
  "restore-conversation": {
    label: "Restore Conversation",
    iconName: "Minimize2",
    isPressed: true,
  },
  "enter-full-screen": {
    label: "Full Screen",
    iconName: "Maximize2",
    isPressed: false,
  },
  "exit-full-screen": {
    label: "Exit Full Screen",
    iconName: "Minimize2",
    isPressed: true,
  },
} as const satisfies Record<PanelToggleAction, PanelToggleActionPresentation>;

export interface PanelToggleControlState {
  action: PanelToggleAction;
  disabled?: boolean;
  label: string;
  isPressed: boolean;
  iconName: PanelToggleIconName;
  onClick: () => void;
}

export interface ResolveShowPanelControlArgs {
  onToggleSecondaryPanel: () => void;
}

/**
 * The conversation header's panel affordance, used only while the secondary
 * panel is closed: a button that opens it. Once the panel is open the toggle
 * moves into the panel header (see {@link resolveConversationCollapseControl}).
 */
export function resolveShowPanelControl({
  onToggleSecondaryPanel,
}: ResolveShowPanelControlArgs): PanelToggleControlState {
  return {
    action: "show-panel",
    ...PANEL_TOGGLE_ACTION_PRESENTATION["show-panel"],
    onClick: onToggleSecondaryPanel,
  };
}

export interface ResolveConversationCollapseControlArgs {
  isConversationCollapsed: boolean;
  onToggleConversationCollapse: () => void;
}

/** Resource-only full-screen control used by hosted split panes. */
export function resolveConversationCollapseControl({
  isConversationCollapsed,
  onToggleConversationCollapse,
}: ResolveConversationCollapseControlArgs): PanelToggleControlState {
  const action: PanelToggleAction = isConversationCollapsed
    ? "exit-full-screen"
    : "enter-full-screen";
  return {
    action,
    ...PANEL_TOGGLE_ACTION_PRESENTATION[action],
    onClick: onToggleConversationCollapse,
  };
}

/**
 * Compact Work mode moves the conversation into a drawer. The control's name
 * stays stable across open and closed — `aria-expanded` carries the state, so
 * a name that flipped between "Show" and "Hide" would only duplicate it.
 */
export const CONVERSATION_DRAWER_CONTROL_LABEL = "Conversation";

/**
 * Persistent indication that an approval or a question is waiting in the
 * closed conversation drawer. The drawer never opens on its own.
 */
export const CONVERSATION_PENDING_INDICATOR_LABEL =
  "Conversation needs your response";

/**
 * Ties the indicator to the drawer control via `aria-describedby`, so the
 * control itself reports the waiting interaction. Scoped by pane like the Work
 * mode toggle's id, so the reference stays unambiguous if a layout ever renders
 * two panes at once.
 */
export function resolveConversationPendingIndicatorElementId(
  paneId: string,
): string {
  return `thread-conversation-pending-indicator-${paneId}`;
}

export interface ResolveWorkModeControlArgs {
  canEnterWorkMode?: boolean;
  isWorkMode: boolean;
  onToggleWorkMode: () => void;
}

/**
 * One transforming control in the work-surface toolbar. Enter promotes the
 * existing work surface; restore returns to Conversation mode.
 */
export function resolveWorkModeControl({
  canEnterWorkMode = true,
  isWorkMode,
  onToggleWorkMode,
}: ResolveWorkModeControlArgs): PanelToggleControlState {
  const action: PanelToggleAction = isWorkMode
    ? "restore-conversation"
    : "enter-work-mode";
  return {
    action,
    ...PANEL_TOGGLE_ACTION_PRESENTATION[action],
    disabled: !isWorkMode && !canEnterWorkMode,
    onClick: onToggleWorkMode,
  };
}

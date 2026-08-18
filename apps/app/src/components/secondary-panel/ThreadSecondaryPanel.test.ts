import { describe, expect, it } from "vitest";
import {
  getSecondaryPanelChromeStackClassName,
  getReservedInlinePanelToggleClassName,
  isSecondaryPanelLayoutTransition,
  resolvePrimaryWorkSurfaceTrafficLightReserveClassName,
  resolveSecondaryPanelHideControl,
} from "./ThreadSecondaryPanel";
import {
  CHROME_ROW_CLASS,
  CHROME_ROW_HEIGHT_CLASS,
  MACOS_COLLAPSED_TOP_LEFT_RESERVE_CLASS,
} from "@/lib/bb-desktop";
import { SECONDARY_PANEL_TOP_CHROME_BACKGROUND_CLASS } from "./panelChromeClasses";

describe("secondary panel surface tone", () => {
  it("uses the same sidebar background token as the primary sidebar", () => {
    expect(SECONDARY_PANEL_TOP_CHROME_BACKGROUND_CLASS).toBe("bg-sidebar");
  });
});

describe("secondary panel hide control", () => {
  it("uses the existing collapse affordance in the compact drawer", () => {
    expect(resolveSecondaryPanelHideControl()).toEqual({
      iconName: "PanelRight",
      label: "Hide right panel",
    });
  });

  it("names the hide control for a primary work surface", () => {
    expect(
      resolveSecondaryPanelHideControl({ isPrimaryWorkSurface: true }),
    ).toEqual({
      iconName: "PanelRight",
      label: "Hide work surface",
    });
  });
});

describe("secondary panel native browser bounds settling", () => {
  it("recognizes the flex transitions that move the panel back to its restored position", () => {
    expect(isSecondaryPanelLayoutTransition("flex-grow")).toBe(true);
    expect(isSecondaryPanelLayoutTransition("flex-basis")).toBe(true);
    expect(isSecondaryPanelLayoutTransition("opacity")).toBe(false);
  });
});

describe("getSecondaryPanelChromeStackClassName", () => {
  it("reserves the combined navigation and active Diff toolbar height", () => {
    const className = getSecondaryPanelChromeStackClassName(true);

    expect(className).toContain("flex");
    expect(className).toContain("flex-col");
    expect(className).toContain("shrink-0");
    expect(className).not.toContain(CHROME_ROW_HEIGHT_CLASS);
    expect(CHROME_ROW_CLASS).toContain(CHROME_ROW_HEIGHT_CLASS);
  });
});

// The reserved inline-toggle slot sits under root compose's pinned right-panel
// toggle. On macOS desktop the top chrome is an [app-region:drag] window-drag
// region; Electron resolves draggable regions in DOM order (later wins), so the
// slot, a descendant of the drag row, must re-declare itself no-drag to carve
// the toggle's footprint back out. Without it Electron swallows the toggle click
// as a window drag and the panel can be opened but never closed. The native
// region resolution can't run in jsdom, so this locks the class contract that
// drives it; before the fix the slot carried no app-region class and this failed.
describe("getReservedInlinePanelToggleClassName", () => {
  it("carves the slot out of the window-drag chrome row under macOS desktop chrome", () => {
    const className = getReservedInlinePanelToggleClassName(true);

    expect(className).toContain("[app-region:no-drag]");
    expect(className).toContain("[-webkit-app-region:no-drag]");
  });

  it("leaves the slot untouched off macOS desktop chrome", () => {
    const className = getReservedInlinePanelToggleClassName(false);

    expect(className).not.toContain("app-region");
  });
});

// BB-46: in Work mode the panel leads the row — the conversation is a rail on
// the far side — so with the main sidebar collapsed the panel is the window's
// flush top-left surface and its leading toolbar shares the title-bar row with
// the macOS traffic lights and the pinned sidebar trigger. Without the reserve
// the leading Info/tab controls render under the lights and directly over the
// sidebar trigger (BB-46's collapsed-left / expanded-right conflict).
describe("resolvePrimaryWorkSurfaceTrafficLightReserveClassName", () => {
  const base = {
    isPrimaryWorkSurface: true,
    renderAsDrawer: false,
    isSidebarShowing: false as boolean | null,
    reserveMacosTrafficLights: true,
  };

  // Covers both thread surfaces. Work mode moves the panel to the leading edge
  // on the split host and on inline thread detail alike. The reserve used to
  // additionally require the split host, which is what left inline detail's tab
  // strip sitting under the traffic lights; with that gate gone the surfaces
  // are indistinguishable here, so one case covers them.
  it("reserves the safe area while the panel is the primary work surface", () => {
    expect(resolvePrimaryWorkSurfaceTrafficLightReserveClassName(base)).toBe(
      MACOS_COLLAPSED_TOP_LEFT_RESERVE_CLASS,
    );
  });

  it("does not reserve when the main sidebar is showing (it hosts the lights)", () => {
    expect(
      resolvePrimaryWorkSurfaceTrafficLightReserveClassName({
        ...base,
        isSidebarShowing: true,
      }),
    ).toBe(false);
  });

  it("does not reserve in Conversation mode (panel sits on the right)", () => {
    expect(
      resolvePrimaryWorkSurfaceTrafficLightReserveClassName({
        ...base,
        isPrimaryWorkSurface: false,
      }),
    ).toBe(false);
  });

  it("does not reserve in the compact drawer layout", () => {
    expect(
      resolvePrimaryWorkSurfaceTrafficLightReserveClassName({
        ...base,
        renderAsDrawer: true,
      }),
    ).toBe(false);
  });

  it("does not reserve off macOS chrome or in fullscreen (no visible lights)", () => {
    expect(
      resolvePrimaryWorkSurfaceTrafficLightReserveClassName({
        ...base,
        reserveMacosTrafficLights: false,
      }),
    ).toBe(false);
  });

  it("treats an absent sidebar context (null) as showing, so it does not reserve", () => {
    expect(
      resolvePrimaryWorkSurfaceTrafficLightReserveClassName({
        ...base,
        isSidebarShowing: null,
      }),
    ).toBe(false);
  });
});

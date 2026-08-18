// @vitest-environment jsdom

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Drawer, DrawerContent, DrawerTitle } from "@bb/shared-ui/drawer";
import { REDUCED_MOTION_QUERY } from "@bb/shared-ui/drawer";

/**
 * These tests render the real vaul-backed drawer rather than a stand-in. The
 * reduced-motion suppression is a vendor mechanism — vaul animates from an
 * injected stylesheet that outweighs any class we could add — so asserting a
 * class name on a mocked shell would pass whether or not motion is actually
 * suppressed. `data-vaul-animate="false"` is the attribute vaul itself
 * declares as `animation: none !important`, so it is the mechanism, not a
 * proxy for it.
 */

const REAL_MATCH_MEDIA = window.matchMedia;

function mockReducedMotion(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query === REDUCED_MOTION_QUERY && matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

function renderOpenDrawer() {
  return render(
    <Drawer open onOpenChange={() => {}}>
      <DrawerContent>
        <DrawerTitle>Conversation</DrawerTitle>
        <button type="button">Inside</button>
      </DrawerContent>
    </Drawer>,
  );
}

function drawerElements() {
  const content = document.querySelector("[data-vaul-drawer]");
  const overlay = document.querySelector("[data-vaul-overlay]");
  return { content, overlay };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.matchMedia = REAL_MATCH_MEDIA;
});

describe("drawer reduced motion", () => {
  it("marks the drawer and its overlay as non-animating when reduced motion is preferred", () => {
    mockReducedMotion(true);
    renderOpenDrawer();

    const { content, overlay } = drawerElements();
    expect(content).not.toBeNull();
    expect(overlay).not.toBeNull();
    // vaul declares `[data-vaul-animate=false]{animation:none!important}`, so
    // this attribute — and only this attribute — actually stops the slide.
    expect(content?.getAttribute("data-vaul-animate")).toBe("false");
    expect(overlay?.getAttribute("data-vaul-animate")).toBe("false");
  });

  it("leaves vaul's own animation state alone when motion is not reduced", () => {
    mockReducedMotion(false);
    renderOpenDrawer();

    const { content, overlay } = drawerElements();
    expect(content?.getAttribute("data-vaul-animate")).not.toBe("false");
    expect(overlay?.getAttribute("data-vaul-animate")).not.toBe("false");
  });

  /**
   * Defect 3 coverage: focus across a real open and close, not a stand-in.
   *
   * The layout owner's focus-recovery effect only reclaims focus when the
   * active element is `document.body` — that is, when a layout change dropped
   * focus on the floor. This asserts the precondition that effect depends on:
   * the real drawer never leaves focus on the body across open or close.
   * Precisely where vaul parks focus (the trigger, the content, the first
   * tabbable child) is vaul's business and it varies with pointer type, so it
   * is deliberately not asserted here.
   */
  it("never drops focus to the body across a real drawer open and close", () => {
    mockReducedMotion(false);
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    document.body.append(trigger);
    trigger.focus();

    function tree(open: boolean) {
      return (
        <Drawer open={open} onOpenChange={() => {}}>
          <DrawerContent>
            <DrawerTitle>Conversation</DrawerTitle>
            <button type="button">Inside</button>
          </DrawerContent>
        </Drawer>
      );
    }

    const view = render(tree(false));
    view.rerender(tree(true));

    expect(
      screen
        .getByRole("button", { name: "Inside" })
        .closest("[data-vaul-drawer]"),
    ).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);

    view.rerender(tree(false));
    expect(document.activeElement).not.toBe(document.body);

    trigger.remove();
  });

  it("keeps the drawer usable by keyboard", () => {
    mockReducedMotion(true);
    const onOpenChange = vi.fn();
    render(
      <Drawer open onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerTitle>Conversation</DrawerTitle>
          <button type="button">Inside</button>
        </DrawerContent>
      </Drawer>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

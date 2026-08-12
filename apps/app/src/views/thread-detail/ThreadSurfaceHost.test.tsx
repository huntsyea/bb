// @vitest-environment jsdom

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ThreadSurfaceHost,
  type ThreadSurfaceArrangement,
  type ThreadSurfaceRegionLayout,
} from "./ThreadSurfaceHost";

function StatefulConversation({ layout }: { layout: ThreadSurfaceRegionLayout }) {
  return (
    <section
      data-testid="conversation-region"
      data-panel-order={layout.panelOrder}
      style={{ order: layout.visualOrder }}
    >
      <label>
        Draft
        <input aria-label="Draft" defaultValue="unfinished prompt" />
      </label>
      <div data-testid="timeline" tabIndex={-1} />
    </section>
  );
}

function StatefulWorkSurface({ layout }: { layout: ThreadSurfaceRegionLayout }) {
  const [activeResource, setActiveResource] = useState("notes.md");

  return (
    <section
      data-testid="work-surface-region"
      data-panel-order={layout.panelOrder}
      style={{ order: layout.visualOrder }}
    >
      <button type="button" onClick={() => setActiveResource("preview.pdf")}>
        Open preview
      </button>
      <div data-testid="active-resource">{activeResource}</div>
    </section>
  );
}

function Fixture({
  arrangement,
}: {
  arrangement: ThreadSurfaceArrangement;
}) {
  return (
    <ThreadSurfaceHost
      arrangement={arrangement}
      renderConversation={(layout) => (
        <StatefulConversation layout={layout} />
      )}
      renderWorkSurface={(layout) => <StatefulWorkSurface layout={layout} />}
    />
  );
}

describe("ThreadSurfaceHost", () => {
  it("keeps one stateful conversation and work surface mounted while rearranging them", () => {
    const view = render(<Fixture arrangement="conversation-primary" />);
    const conversation = screen.getByTestId("conversation-region");
    const workSurface = screen.getByTestId("work-surface-region");
    const draft = screen.getByRole("textbox", { name: "Draft" });
    const timeline = screen.getByTestId("timeline");

    fireEvent.change(draft, { target: { value: "edited draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Open preview" }));
    timeline.scrollTop = 240;
    draft.focus();

    view.rerender(<Fixture arrangement="work-surface-primary" />);

    expect(screen.getAllByTestId("conversation-region")).toHaveLength(1);
    expect(screen.getAllByTestId("work-surface-region")).toHaveLength(1);
    expect(screen.getByTestId("conversation-region")).toBe(conversation);
    expect(screen.getByTestId("work-surface-region")).toBe(workSurface);
    const preservedDraft = screen.getByRole("textbox", { name: "Draft" });
    expect(preservedDraft).toBeInstanceOf(HTMLInputElement);
    if (!(preservedDraft instanceof HTMLInputElement)) {
      throw new Error("Expected the draft control to be an input");
    }
    expect(preservedDraft.value).toBe("edited draft");
    expect(screen.getByTestId("timeline").scrollTop).toBe(240);
    expect(screen.getByTestId("active-resource").textContent).toBe(
      "preview.pdf",
    );
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Draft" }),
    );
    expect(screen.getByTestId("conversation-region").style.order).toBe("3");
    expect(screen.getByTestId("work-surface-region").style.order).toBe("1");
    expect(
      screen.getByTestId("conversation-region").getAttribute(
        "data-panel-order",
      ),
    ).toBe("2");
    expect(
      screen
        .getByTestId("work-surface-region")
        .getAttribute("data-panel-order"),
    ).toBe("1");

    view.rerender(<Fixture arrangement="conversation-primary" />);

    expect(screen.getByTestId("conversation-region")).toBe(conversation);
    expect(screen.getByTestId("work-surface-region")).toBe(workSurface);
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Draft" }),
    );
  });
});

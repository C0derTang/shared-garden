import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BottomSheet } from "@/components/ui/bottom-sheet";

describe("bottom sheet integration", () => {
  it("opens with an accessible name and description, traps focus, and restores focus after Escape", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Outside</button>
        <BottomSheet
          trigger={<button>Open flower</button>}
          title="Your rose"
          description="Care and history"
        >
          <button>Water</button>
          <a href="#history">History</a>
        </BottomSheet>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Open flower" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const sheet = screen.getByRole("dialog", { name: "Your rose" });
    expect(sheet).toHaveAccessibleDescription("Care and history");
    expect(within(sheet).getByText("Care and history")).not.toHaveClass(
      "sheet-description-hidden",
    );
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    const close = within(sheet).getByRole("button", { name: "Close" });
    expect(close).toHaveTextContent("×");
    expect(close).not.toHaveTextContent(/^Close$/);
    close.focus();
    await user.tab();
    expect(within(sheet).getByRole("button", { name: "Water" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("hides a redundant description visually only when explicitly requested", async () => {
    const user = userEvent.setup();
    render(
      <BottomSheet
        trigger={<button>Open compact flower</button>}
        title="Rose"
        description="Share a note and review its history."
        hideDescription
      >
        <p>Flower content</p>
      </BottomSheet>,
    );

    await user.click(
      screen.getByRole("button", { name: "Open compact flower" }),
    );
    const sheet = screen.getByRole("dialog", { name: "Rose" });
    expect(sheet).toHaveAccessibleDescription(
      "Share a note and review its history.",
    );
    expect(
      within(sheet).getByText("Share a note and review its history."),
    ).toHaveClass("sheet-description-hidden");
  });

  it("dismisses using the visible close control", async () => {
    const user = userEvent.setup();
    render(
      <BottomSheet
        trigger={<button>About</button>}
        title="About the garden"
        description="A place for two"
      >
        <p>Grow together.</p>
      </BottomSheet>,
    );
    await user.click(screen.getByRole("button", { name: "About" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "About" })).toHaveFocus();
  });
});

import { useState } from "react";
import { createPortal } from "react-dom";
import { act, fireEvent } from "@testing-library/react";
import { SheetScope, useSheetScope } from "./sheet-scope";
it("defers a newly pending sheet while a flower draft owns focus, then opens it after Close", async () => {
  let pending!: () => void;
  function Example() {
    const [open, setOpen] = useState(false);
    pending = () => setOpen(true);
    return <SheetScope><BottomSheet trigger={<button>Rose</button>} title="Rose note" description="Care"><input aria-label="Draft" /></BottomSheet><BottomSheet open={open} onOpenChange={setOpen} trigger={<button>Moment</button>} title="Pending moment" description="A moment"><button>Choose</button></BottomSheet></SheetScope>;
  }
  render(<Example />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Rose" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep this draft" } });
  await act(async () => pending());
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByRole("textbox")).toHaveValue("Keep this draft");
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("dialog", { name: "Pending moment" })).toBeInTheDocument();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
});

it("releases an unmounted sheet and starts a new scope without stale ownership", async () => {
  const { StrictMode } = await import("react");
  const view = render(<StrictMode><SheetScope><BottomSheet open trigger={<button>First</button>} title="First sheet" description="First"><p>First draft</p></BottomSheet><BottomSheet open trigger={<button>Second</button>} title="Second sheet" description="Second"><button>Second action</button></BottomSheet></SheetScope></StrictMode>);
  expect(screen.getByRole("dialog", { name: "First sheet" })).toBeInTheDocument();
  view.rerender(<StrictMode><SheetScope><BottomSheet key="second" open trigger={<button>Second</button>} title="Second sheet" description="Second"><button>Second action</button></BottomSheet></SheetScope></StrictMode>);
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByRole("dialog", { name: "Second sheet" })).toBeInTheDocument();
  view.unmount();
  render(<SheetScope><BottomSheet open trigger={<button>New visit</button>} title="New visit" description="New"><p>Ready</p></BottomSheet></SheetScope>);
  expect(screen.getByRole("dialog", { name: "New visit" })).toBeInTheDocument();
});

it("moves one notice to the next queued sheet when the active sheet closes", async () => {
  function Notice() {
    const scope = useSheetScope();
    return scope?.noticeContainer ? createPortal(<p role="status">Shared notice</p>, scope.noticeContainer) : null;
  }
  function Example() {
    const [first, setFirst] = useState(true);
    return <SheetScope>
      <Notice />
      <BottomSheet open={first} onOpenChange={setFirst} trigger={<button>First</button>} title="First sheet" description="First"><input aria-label="First draft" /></BottomSheet>
      <BottomSheet open trigger={<button>Second</button>} title="Second sheet" description="Second"><input aria-label="Second draft" /></BottomSheet>
    </SheetScope>;
  }
  const user = userEvent.setup(); render(<Example />);
  const first = await screen.findByRole("dialog", { name: "First sheet" });
  expect(within(first).getByRole("status")).toHaveTextContent("Shared notice");
  expect(screen.getAllByRole("status")).toHaveLength(1);
  await user.keyboard("{Escape}");
  const second = await screen.findByRole("dialog", { name: "Second sheet" });
  expect(within(second).getByRole("status")).toHaveTextContent("Shared notice");
  expect(screen.getAllByRole("status")).toHaveLength(1);
});

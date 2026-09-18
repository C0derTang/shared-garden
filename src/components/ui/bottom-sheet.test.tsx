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
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    const close = within(sheet).getByRole("button", { name: "Close" });
    close.focus();
    await user.tab();
    expect(within(sheet).getByRole("button", { name: "Water" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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
import { act, fireEvent } from "@testing-library/react";
import { SheetScope } from "./sheet-scope";
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

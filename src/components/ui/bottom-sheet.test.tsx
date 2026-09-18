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

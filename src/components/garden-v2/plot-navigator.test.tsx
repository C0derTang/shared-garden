import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GardenPlot } from "@/lib/garden-v2/plots";
import type { Plant } from "@/lib/garden-v2/model";
import { PlotNavigator } from "./plot-navigator";

const plant = {} as Plant;
/** Two beds: spots 1–3 in bed 1, 13–14 in bed 2. */
const PLOTS: GardenPlot[] = [
  { spot: 2, bed: 1, plant, label: "rose · 3 of 5", detail: "bed 1", ariaLabel: "Rose, in bud, 3 of 5. Bed 1", due: true },
  { spot: 1, bed: 1, plant: null, label: "empty spot", detail: "bed 1", ariaLabel: "Empty spot, bed 1", due: false },
  { spot: 3, bed: 1, plant, label: "daisy · in bloom", detail: "bed 1", ariaLabel: "Daisy, in bloom. Bed 1", due: false },
  { spot: 13, bed: 2, plant, label: "tulip · 1 of 7", detail: "bed 2", ariaLabel: "Tulip, a seedling, 1 of 7. Bed 2", due: false },
  { spot: 14, bed: 2, plant: null, label: "empty spot", detail: "bed 2", ariaLabel: "Empty spot, bed 2", due: false },
];

function Harness({ onVisit = vi.fn(), onChange = vi.fn() }: { onVisit?: (plot: GardenPlot) => void; onChange?: (spot: number | null) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <PlotNavigator
      plots={PLOTS}
      selected={selected}
      onSelect={(spot) => {
        setSelected(spot);
        onChange(spot);
      }}
      onVisit={onVisit}
    />
  );
}

const active = () => within(screen.getByRole("listbox")).queryByRole("option", { selected: true });

describe("PlotNavigator", () => {
  it("is a labelled listbox of every plot, with instructions and no selection at first", () => {
    render(<Harness />);
    const list = screen.getByRole("listbox", { name: "Plots in the garden" });
    expect(within(list).getAllByRole("option")).toHaveLength(5);
    expect(list).toHaveAccessibleDescription(/Up and down step through the plots, left and right move between beds/);
    expect(list).not.toHaveAttribute("aria-activedescendant");
    expect(active()).toBeNull();
    expect(screen.getByText("step through the plots")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous plot" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next plot" })).toBeInTheDocument();
  });

  it("steps through the plots with the arrow keys, bed by bed with left and right", async () => {
    const user = userEvent.setup();
    const changes: (number | null)[] = [];
    render(<Harness onChange={(spot) => changes.push(spot)} />);
    const list = screen.getByRole("listbox");
    list.focus();
    await user.keyboard("{ArrowDown}");
    expect(active()).toHaveAccessibleName("Rose, in bud, 3 of 5. Bed 1");
    expect(list).toHaveAttribute("aria-activedescendant", active()!.id);
    expect(active()).toHaveTextContent("rose · 3 of 5");
    expect(active()).toHaveTextContent("bed 1");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(active()).toHaveAccessibleName("Daisy, in bloom. Bed 1");
    await user.keyboard("{ArrowUp}");
    expect(active()).toHaveAccessibleName("Empty spot, bed 1");
    await user.keyboard("{ArrowRight}");
    expect(active()).toHaveAccessibleName("Tulip, a seedling, 1 of 7. Bed 2");
    await user.keyboard("{ArrowRight}");
    expect(active()).toHaveAccessibleName("Tulip, a seedling, 1 of 7. Bed 2");
    await user.keyboard("{ArrowLeft}");
    expect(active()).toHaveAccessibleName("Rose, in bud, 3 of 5. Bed 1");
    await user.keyboard("{End}");
    expect(active()).toHaveAccessibleName("Empty spot, bed 2");
    await user.keyboard("{Home}");
    expect(active()).toHaveAccessibleName("Rose, in bud, 3 of 5. Bed 1");
    expect(changes).toEqual([2, 1, 3, 1, 13, 2, 14, 2]);
  });

  it("visits the selected plot with Enter, a tap on its name or the visit word, and offers planting on an empty spot", async () => {
    const user = userEvent.setup();
    const onVisit = vi.fn();
    render(<Harness onVisit={onVisit} />);
    const list = screen.getByRole("listbox");
    list.focus();
    // Enter with nothing selected starts at the first plot.
    await user.keyboard("{Enter}");
    expect(onVisit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onVisit).toHaveBeenLastCalledWith(PLOTS[0]);
    await user.click(screen.getByRole("button", { name: "visit" }));
    expect(onVisit).toHaveBeenCalledTimes(2);
    await user.click(active()!);
    expect(onVisit).toHaveBeenCalledTimes(3);
    list.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.queryByRole("button", { name: "visit" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "plant" }));
    expect(onVisit).toHaveBeenLastCalledWith(PLOTS[1]);
  });

  it("returns to the whole garden with Escape", async () => {
    const user = userEvent.setup();
    const changes: (number | null)[] = [];
    render(<Harness onChange={(spot) => changes.push(spot)} />);
    screen.getByRole("listbox").focus();
    await user.keyboard("{ArrowDown}{Escape}");
    expect(changes).toEqual([2, null]);
    expect(active()).toBeNull();
    expect(screen.getByText("The whole garden")).toBeInTheDocument();
  });

  it("steps with the on-screen controls and announces the plot", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const next = screen.getByRole("button", { name: "Next plot" });
    await user.click(next);
    expect(active()).toHaveAccessibleName("Rose, in bud, 3 of 5. Bed 1");
    expect(screen.getByRole("button", { name: "Previous plot" })).toHaveAttribute("aria-disabled", "true");
    await user.click(next);
    expect(active()).toHaveAccessibleName("Empty spot, bed 1");
    expect(screen.getByText("Empty spot, bed 1. 2 of 5")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous plot" }));
    expect(active()).toHaveAccessibleName("Rose, in bud, 3 of 5. Bed 1");
  });

  it("follows swipes on a phone: up for the next plot, down for the previous, sideways between beds", () => {
    render(<Harness />);
    const navigator = screen.getByRole("listbox").closest("[data-plot-navigator]")!;
    const swipe = (dx: number, dy: number) => {
      fireEvent.pointerDown(navigator, { pointerType: "touch", pointerId: 1, clientX: 200, clientY: 700 });
      fireEvent.pointerUp(navigator, { pointerType: "touch", pointerId: 1, clientX: 200 + dx, clientY: 700 + dy });
    };
    swipe(0, -60);
    expect(active()).toHaveAccessibleName("Rose, in bud, 3 of 5. Bed 1");
    swipe(4, -50);
    expect(active()).toHaveAccessibleName("Empty spot, bed 1");
    swipe(0, 45);
    expect(active()).toHaveAccessibleName("Rose, in bud, 3 of 5. Bed 1");
    swipe(-70, 6);
    expect(active()).toHaveAccessibleName("Tulip, a seedling, 1 of 7. Bed 2");
    swipe(70, 0);
    expect(active()).toHaveAccessibleName("Rose, in bud, 3 of 5. Bed 1");
    // A short touch is a tap, not a swipe; a mouse drag never swipes.
    swipe(5, -10);
    expect(active()).toHaveAccessibleName("Rose, in bud, 3 of 5. Bed 1");
    fireEvent.pointerDown(navigator, { pointerType: "mouse", pointerId: 2, clientX: 200, clientY: 700 });
    fireEvent.pointerUp(navigator, { pointerType: "mouse", pointerId: 2, clientX: 200, clientY: 600 });
    expect(active()).toHaveAccessibleName("Rose, in bud, 3 of 5. Bed 1");
  });

  it("marks a plot whose care is open for you", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const navigator = screen.getByRole("listbox").closest("[data-plot-navigator]")!;
    await user.click(screen.getByRole("button", { name: "Next plot" }));
    expect(navigator).toHaveAttribute("data-due");
    await user.click(screen.getByRole("button", { name: "Next plot" }));
    expect(navigator).not.toHaveAttribute("data-due");
  });
});

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GardenPlot } from "@/lib/garden-v2/plots";
import { PlotList, focusPlot } from "./plot-list";

const plots: GardenPlot[] = [
  { spot: 5, bed: 1, plant: null, label: "empty spot · bed 1", ariaLabel: "Empty spot, bed 1" },
  { spot: 1, bed: 1, plant: null, label: "rose · 3 of 5 · bed 1", ariaLabel: "rose, opening, 3 of 5. Bed 1" },
];

describe("the hidden plot list (#210)", () => {
  it("lists every plot as a button in the given order and opens one on Enter", async () => {
    const onOpen = vi.fn();
    render(<PlotList plots={plots} onOpen={onOpen} />);
    const list = screen.getByRole("navigation", { name: "Plots in the garden" });
    const buttons = within(list).getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Empty spot, bed 1", "rose, opening, 3 of 5. Bed 1"]);
    expect(buttons[1]).toHaveTextContent("rose · 3 of 5 · bed 1");
    buttons[1]!.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith(plots[1]);
  });

  it("is inert and hidden from assistive technology while hidden", () => {
    render(<PlotList plots={plots} onOpen={vi.fn()} hidden />);
    const list = document.querySelector("[data-plot-list]")!;
    expect(list).toHaveAttribute("inert");
    expect(list).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("returns focus to the plot that opened a view, else to the world", () => {
    render(
      <>
        <div data-garden-world="" tabIndex={0} />
        <PlotList plots={plots} onOpen={vi.fn()} />
      </>,
    );
    const world = document.querySelector<HTMLElement>("[data-garden-world]")!;
    const rose = document.querySelector<HTMLElement>('[data-plot-spot="1"]')!;
    act(() => focusPlot(1));
    expect(document.activeElement).toBe(rose);
    act(() => rose.blur());
    act(() => focusPlot(null));
    expect(document.activeElement).toBe(world);
    // A plot that is no longer listed falls back to the world too.
    act(() => world.blur());
    act(() => focusPlot(99));
    expect(document.activeElement).toBe(world);
  });
});

it('does not let a late activity-close focus return overwrite a newly chosen plot',()=>{render(<PlotList plots={plots} onOpen={vi.fn()}/>);const next=document.querySelector<HTMLElement>('[data-plot-spot="5"]')!;next.focus();act(()=>focusPlot(1));expect(document.activeElement).toBe(next);});

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { v2GardenFixture } from "@/test/garden-v2-fixture";
import { flowerTypes } from "@/lib/garden-v2/model";
import { PlantView } from "./plant-view";

// A cached opening address would submit the wrong slot after shared refresh.
describe("existing planting screen from the shovel", () => {
  it.each(flowerTypes)("plants %s only on explicit confirmation at the current persisted slot", async type => {
    const user = userEvent.setup(), state = v2GardenFixture();
    state.garden.next_spot = 1;
    state.plants[0]!.flower.spot = 12001;
    const mutate = vi.fn(async () => ({ saved: false, state: null, error: "Synthetic conflict" }));
    const props = { open: true, state, busy: false, mutate, onClose: vi.fn(), onPlanted: vi.fn() };
    const view = render(<PlantView {...props} />);
    const drawer = screen.getByRole("dialog", { name: "plant a seed" });
    expect(within(drawer).getAllByRole("radio")).toHaveLength(13);
    await user.click(within(drawer).getByRole("radio", { name: new RegExp(`^${type}`) }));
    if (type === "dandelion") await user.type(screen.getByLabelText("Your shared wish"), "A synthetic wish");
    expect(mutate).not.toHaveBeenCalled();
    const refreshed = structuredClone(state); refreshed.garden.next_spot = 7;
    view.rerender(<PlantView {...props} state={refreshed} />);
    expect(within(drawer).getByRole("radio", { name: new RegExp(`^${type}`) })).toBeChecked();
    if (type === "dandelion") expect(screen.getByLabelText("Your shared wish")).toHaveValue("A synthetic wish");
    await user.click(screen.getByRole("button", { name: `plant the ${type}` }));
    expect(mutate).toHaveBeenCalledExactlyOnceWith({ kind: "plant", type, spot: 7, ...(type === "dandelion" ? { wish: "A synthetic wish" } : {}) });
    expect(screen.getByRole("alert")).toHaveTextContent("Synthetic conflict");
    refreshed.garden.next_spot = 9;
    view.rerender(<PlantView {...props} state={{...refreshed}} />);
    await user.click(screen.getByRole("button", { name: `plant the ${type}` }));
    expect(mutate).toHaveBeenLastCalledWith({ kind: "plant", type, spot: 9, ...(type === "dandelion" ? { wish: "A synthetic wish" } : {}) });
  });

  it("locks duplicate submits and reports the actual submitted spot after refresh", async () => {
    const state = v2GardenFixture(); let finish!: (value: {saved: true; state: null; error: null}) => void;
    const mutate = vi.fn(() => new Promise<{saved: true; state: null; error: null}>(resolve => { finish = resolve; }));
    const onPlanted = vi.fn(), props = {open: true, state, busy: false, mutate, onClose: vi.fn(), onPlanted};
    const view = render(<PlantView {...props}/>), form = screen.getByRole("button",{name:"plant the rose"}).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(mutate).toHaveBeenCalledTimes(1);
    view.rerender(<PlantView {...props} state={{...state,garden:{...state.garden,next_spot:99}}}/>);
    await act(async()=>finish({saved:true,state:null,error:null}));
    expect(onPlanted).toHaveBeenCalledWith({saved:true,state:null,error:null},2);
  });

  it.each([0,-1,NaN,1.5,Number.MAX_SAFE_INTEGER+1])("refuses invalid persisted next spot %s", spot => {
    const state=v2GardenFixture();state.garden.next_spot=spot;const mutate=vi.fn();
    render(<PlantView open state={state} busy={false} mutate={mutate} onClose={vi.fn()} onPlanted={vi.fn()}/>);
    const submit=screen.getByRole("button",{name:"plant the rose"});expect(submit).toBeDisabled();fireEvent.submit(submit.closest("form")!);expect(mutate).not.toHaveBeenCalled();
  });
});

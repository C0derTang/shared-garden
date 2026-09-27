vi.mock("@/lib/settings/actions", () => ({ readSettings: vi.fn(), saveSetting: vi.fn() }));
vi.mock("@/lib/peony/actions", () => ({
  readPeony: vi.fn(),
  mutatePeony: vi.fn(),
}));
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { gardenFixture } from "@/test/garden-fixture";
import type { FlowerType } from "./flower-sprite";
import type { GardenState } from "@/lib/garden/model";
const { refreshGarden, mutateGarden, loadFlowerHistory } = vi.hoisted(() => ({
  refreshGarden: vi.fn(),
  mutateGarden: vi.fn(),
  loadFlowerHistory: vi.fn(),
}));
vi.mock("@/lib/garden/actions", () => ({
  refreshGarden,
  mutateGarden,
  loadFlowerHistory,
}));
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
import { GardenClient } from "./garden-client";
import { SeedPicker } from "./seed-picker";

function addPlant(
  state: GardenState,
  type: FlowerType,
  spot: number,
  bloomed = false,
) {
  const base = state.plants[0];
  state.plants.push({
    ...structuredClone(base),
    flower: {
      ...structuredClone(base.flower),
      id: `00000000-0000-4000-8000-0000000001${String(spot).padStart(2, "0")}`,
      type_key: type,
      spot,
      is_initial: false,
      first_bloom_at: bloomed ? state.server_now : null,
      first_bloom_day: bloomed ? state.garden_day : null,
    },
  });
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshGarden.mockResolvedValue({ state: gardenFixture(), error: null });
});

it("goes straight from planting to the new flower's first care in the same sheet", async () => {
  const user = userEvent.setup();
  const state = gardenFixture();
  refreshGarden.mockResolvedValue({ state, error: null });
  render(<GardenClient initial={{ state, error: null }} guideEnabled={false} />);
  await user.click(screen.getByRole("button", { name: "Plant in spot 9" }));
  const sheet = screen.getByRole("dialog", { name: "Plant something together" });
  await user.click(within(sheet).getByRole("button", { name: /^Rose/ }));
  const planted = addPlant(structuredClone(state), "rose", 9);
  refreshGarden.mockResolvedValue({ state: planted, error: null });
  mutateGarden.mockResolvedValue({ state: planted, saved: true, error: null });
  await user.click(within(sheet).getByRole("button", { name: "Plant Rose" }));

  const care = await screen.findByRole("dialog", { name: "Rose planted ✿" });
  expect(mutateGarden).toHaveBeenCalledWith({ kind: "plant", type: "rose", spot: 9 });
  expect(within(care).getByRole("heading", { name: "Rose planted ✿" })).toHaveFocus();
  expect(within(care).getByRole("textbox", { name: "Note about today" })).toBeInTheDocument();
  expect(within(care).getByRole("button", { name: "Share care" })).toBeInTheDocument();
  expect(within(care).queryByRole("button", { name: /^Plant / })).not.toBeInTheDocument();

  // Closing and reopening shows the flower's ordinary sheet.
  await user.click(within(care).getByRole("button", { name: "Close" }));
  await user.click(screen.getByRole("button", { name: /^Rose, spot 9/ }));
  expect(screen.getByRole("dialog", { name: "Rose" })).toBeInTheDocument();
});

it("keeps the picker open with the error when planting is rejected", async () => {
  const user = userEvent.setup();
  const state = gardenFixture();
  refreshGarden.mockResolvedValue({ state, error: null });
  mutateGarden.mockResolvedValue({ state, saved: false, error: "Spot no longer available." });
  render(<GardenClient initial={{ state, error: null }} guideEnabled={false} />);
  await user.click(screen.getByRole("button", { name: "Plant in spot 9" }));
  await user.click(screen.getByRole("button", { name: /^Marigold/ }));
  await user.click(screen.getByRole("button", { name: "Plant Marigold" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Spot no longer available.");
  expect(screen.getByRole("dialog", { name: "Plant something together" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Marigold/ })).toHaveAttribute("aria-pressed", "true");
});

it("gives each seed slot its full name and describes the chosen seed in the item card", async () => {
  const user = userEvent.setup();
  render(
    <SeedPicker state={gardenFixture()} spot={9} busy={false} mutate={mutateGarden} onPlanted={() => {}} />,
  );
  const bag = screen.getByRole("region", { name: /Seed bag/ });
  const rose = within(bag).getByRole("button", {
    name: "Rose, Note about today. 5 growth units to bloom. 3 of 3 available to grow.",
  });
  expect(rose).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("Pick a seed from your bag to see its ritual.")).toBeInTheDocument();
  await user.click(rose);
  expect(rose).toHaveAttribute("aria-pressed", "true");
  const card = document.querySelector<HTMLElement>("[data-item-card]")!;
  expect(card).toHaveTextContent("Rose");
  expect(card).toHaveTextContent("Note about today");
  expect(card).toHaveTextContent("5 growth units to bloom");
  expect(card).toHaveTextContent("3 of 3 available to grow.");
  expect(screen.getByRole("button", { name: "Plant Rose" })).toBeEnabled();
});

it("leads an empty bag with the next unlock", () => {
  const full = gardenFixture();
  (
    [["rose", 2], ["rose", 3], ["rose", 4], ["tulip", 5], ["marigold", 6], ["marigold", 7]] as const
  ).forEach(([type, spot]) => addPlant(full, type, spot));
  const view = render(
    <SeedPicker state={full} spot={9} busy={false} mutate={mutateGarden} onPlanted={() => {}} />,
  );
  expect(screen.getByText("Bloom 1 more flower to unlock Daisy.")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: /Seed bag/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choose a seed" })).toBeDisabled();
  expect(screen.getByText("Still to unlock (13)")).toBeInTheDocument();

  // One bloom later Daisy is unlocked but busy too, so Hydrangea is next.
  const later = addPlant(structuredClone(full), "daisy", 8);
  later.plants.find((p) => p.flower.spot === 2)!.flower.first_bloom_at = later.server_now;
  addPlant(later, "rose", 10);
  later.unlocks.push({ type_key: "daisy", unlocked_at: later.server_now });
  view.rerender(
    <SeedPicker state={later} spot={9} busy={false} mutate={mutateGarden} onPlanted={() => {}} />,
  );
  expect(screen.getByText("Bloom 1 more flower to unlock Hydrangea.")).toBeInTheDocument();
});

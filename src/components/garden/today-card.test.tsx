vi.mock("@/lib/settings/actions", () => ({ readSettings: vi.fn(), saveSetting: vi.fn() }));
vi.mock("@/lib/peony/actions", () => ({ readPeony: vi.fn(), mutatePeony: vi.fn() }));
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { gardenFixture } from "@/test/garden-fixture";
import type { GardenState, Plant } from "@/lib/garden/model";
import type { FlowerType } from "./flower-sprite";
const { refreshGarden, mutateGarden, loadFlowerHistory } = vi.hoisted(() => ({
  refreshGarden: vi.fn(),
  mutateGarden: vi.fn(),
  loadFlowerHistory: vi.fn(),
}));
vi.mock("@/lib/garden/actions", () => ({ refreshGarden, mutateGarden, loadFlowerHistory }));
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
import { GardenClient } from "./garden-client";
import { TodayCard } from "./today-card";

function plant(state: GardenState, type: FlowerType, spot: number, options: Partial<Plant["flower"]> & { m1?: boolean; m2?: boolean } = {}): Plant {
  const { m1 = false, m2 = false, ...flower } = options;
  const base = state.plants[0];
  return {
    ...base,
    flower: { ...base.flower, id: `00000000-0000-4000-8000-${String(spot).padStart(12, "0")}`, type_key: type, spot, is_initial: false, ...flower },
    member1_submitted: m1,
    member2_submitted: m2,
  };
}
function garden(memberId: 1 | 2 = 1) {
  const state = gardenFixture();
  state.member_id = memberId;
  state.plants = [
    plant(state, "cactus", 1, { m1: true, m2: true }),
    plant(state, "rose", 2, { growth_units: 2 }),
    plant(state, "tulip", 3, { m2: true }),
    plant(state, "marigold", 4, { m1: true, m2: true, growth_units: 4 }),
  ];
  return state;
}
function mount(state: GardenState) {
  refreshGarden.mockResolvedValue({ state, error: null });
  return render(<GardenClient initial={{ state, error: null }} guideEnabled={false} />);
}
const card = () => screen.getByRole("region", { name: "Today" });
beforeEach(() => vi.clearAllMocks());

it("counts what each member has left and tends the pair their care completes", async () => {
  const user = userEvent.setup();
  const view = mount(garden(1));
  expect(within(card()).getByRole("button", { name: /You 2 to tend.*Partner 1 to tend/ })).toHaveAttribute("aria-expanded", "false");
  const tend = within(card()).getByRole("button", { name: "Tend Tulip in spot 3" });
  await user.click(tend);
  const sheet = screen.getByRole("dialog", { name: "Tulip" });
  expect(within(sheet).getByText("Your partner cared today. Add yours before 4 a.m. to grow.")).toBeInTheDocument();
  await user.click(within(sheet).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(within(card()).getByRole("button", { name: /^Tend Tulip/ })).toHaveFocus());
  view.unmount();

  mount(garden(2));
  expect(within(card()).getByRole("button", { name: /You 1 to tend.*Partner 2 to tend/ })).toBeInTheDocument();
  expect(within(card()).getByRole("button", { name: "Tend Rose in spot 2" })).toBeInTheDocument();
});

it("lists the flowers still due, opens one, and returns focus to its row", async () => {
  const user = userEvent.setup();
  mount(garden(1));
  const toggle = within(card()).getByRole("button", { name: /You 2 to tend/ });
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  const list = within(card()).getByRole("list", { name: "Still to tend today" });
  expect(within(list).getAllByRole("button").map((row) => row.textContent)).toEqual([
    "Tulip Partner cared · add yours, spot 3",
    "Rose Not cared yet · may lose growth, spot 2",
  ]);
  const rose = within(list).getByRole("button", { name: /^Rose/ });
  await user.click(rose);
  const sheet = screen.getByRole("dialog", { name: "Rose" });
  expect(within(sheet).getByText(/needs you both by 4 a\.m\., or it loses a growth unit/)).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(within(card()).getByRole("button", { name: /^Rose/ })).toHaveFocus());
  await user.keyboard("{Escape}");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveFocus();
  expect(within(card()).queryByRole("list")).not.toBeInTheDocument();
});

it("offers a seed when nothing is due for you, then rests when both are done", async () => {
  const user = userEvent.setup();
  const state = garden(1);
  for (const p of state.plants) p.member1_submitted = true;
  const view = mount(state);
  expect(within(card()).getByRole("button", { name: /You all tended.*Partner 1 to tend/ })).toBeInTheDocument();
  await user.click(within(card()).getByRole("button", { name: "Plant a seed in spot 5" }));
  const sheet = screen.getByRole("dialog", { name: "Plant something together" });
  expect(within(sheet).getByText(/Spot 5/)).toBeInTheDocument();
  view.unmount();

  for (const p of state.plants) p.member2_submitted = true;
  mount(state);
  expect(within(card()).getByText("All tended today")).toBeInTheDocument();
  expect(within(card()).queryByRole("button", { name: /You/ })).not.toBeInTheDocument();
});

it("names each flower's cue on the surface", () => {
  const state = garden(1);
  state.plants.push(plant(state, "rose", 5, { m1: true, growth_units: 3 }));
  mount(state);
  expect(screen.getByRole("button", { name: "Tulip, spot 3, 0 of 7 growth units, 1 of 2 cared today, your partner cared, add yours" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Marigold, spot 4, 4 of 5 growth units, 2 of 2 cared today, blooms at 4 a.m." })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rose, spot 2, 2 of 5 growth units, 0 of 2 cared today, may lose growth at 4 a.m." })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rose, spot 5, 3 of 5 growth units, 1 of 2 cared today" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Cactus, spot 1, 0 of 10 growth units, 2 of 2 cared today$/ })).toBeInTheDocument();
});

it("turns compact while a crowded While-you-were-away card is open, and keeps focus on its action", async () => {
  const user = userEvent.setup();
  // jsdom has no layout: a 130px bar whose plaque ends at 480px, a 14px title
  // tab, and an away card whose unscrolled top is `awayTop`.
  const heights = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.matches("section > div:last-child") ? 130 : 0;
  });
  const rects = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const box = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
    if (this.matches("section[aria-labelledby]")) return box(400, 480);
    if (this.matches("section[aria-labelledby] > h2")) return box(386, 404);
    return box(0, 0);
  });
  const host = document.createElement("div");
  function awayCard(awayTop: number) {
    const away = document.createElement("section");
    Object.defineProperty(away, "offsetParent", { get: () => host });
    Object.defineProperty(away, "offsetTop", { get: () => awayTop });
    return away;
  }
  const state = garden(1);
  const visit = vi.fn();
  const view = render(<TodayCard state={state} visit={visit} />);
  const toggle = within(card()).getByRole("button", { name: /You 2 to tend.*Partner 1 to tend/ });
  await user.click(toggle);
  expect(within(card()).getByRole("list", { name: "Still to tend today" })).toBeInTheDocument();

  // Plenty of room: 20 + 200 + 10 stays above the full plaque's tab at 336px.
  view.rerender(<TodayCard state={state} visit={visit} away={awayCard(20)} />);
  expect(card()).not.toHaveAttribute("data-compact");
  expect(toggle).toBeInTheDocument();

  // Crowded: only the title tab and the next action remain, and focus on the
  // hidden list toggle moves to that action.
  toggle.focus();
  view.rerender(<TodayCard state={state} visit={visit} away={awayCard(200)} />);
  await waitFor(() => expect(card()).toHaveAttribute("data-compact", "true"));
  expect(within(card()).queryByRole("button", { name: /to tend/ })).not.toBeInTheDocument();
  expect(within(card()).queryByRole("list")).not.toBeInTheDocument();
  const tend = within(card()).getByRole("button", { name: "Tend Tulip in spot 3" });
  expect(tend).toHaveFocus();
  expect(within(card()).getByText("You 2 to tend. Partner 1 to tend.")).toBeInTheDocument();

  // Once the away card closes, the full plaque returns.
  view.rerender(<TodayCard state={state} visit={visit} away={null} />);
  expect(card()).not.toHaveAttribute("data-compact");
  expect(within(card()).getByRole("button", { name: /You 2 to tend/ })).toBeInTheDocument();
  heights.mockRestore();
  rects.mockRestore();
});

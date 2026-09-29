vi.mock("@/lib/replies/actions", () => ({ readReplies: vi.fn().mockResolvedValue({ replies: [], error: null }), saveReply: vi.fn() }));
vi.mock("@/lib/peony/actions", () => ({
  readPeony: vi.fn(),
  mutatePeony: vi.fn(),
}));
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { entryFixture, gardenFixture } from "@/test/garden-fixture";
import { moods } from "@/lib/garden/model";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/garden/actions", () => ({ loadFlowerHistory: load }));
import { FlowerSheet } from "./flower-sheet";
beforeEach(() => vi.clearAllMocks());
function setup(type: "hydrangea" | "daisy") {
  const state = gardenFixture();
  const plant = state.plants[0];
  plant.flower.type_key = type;
  return {
    state,
    plant,
    item: state.catalog.find((item) => item.type_key === type)!,
    now: Date.parse(state.server_now),
    busy: false,
    mutate: vi.fn(),
  };
}
const history = (payload: Record<string, string>) => ({
  ...entryFixture(),
  id: 50,
  author_id: 2 as const,
  garden_day: "2026-09-17",
  original_posted_at: "2026-09-17T17:00:00Z",
  updated_at: "2026-09-17T17:00:00Z",
  payload,
  edit_deadline: null,
  can_edit: false,
});
it("names each Hydrangea mood colour in words beside a decorative swatch", () => {
  const p = setup("hydrangea");
  render(<FlowerSheet {...p} />);
  const group = screen.getByRole("group", { name: "How are you feeling?" });
  const radios = within(group).getAllByRole("radio");
  expect(radios.map((radio) => radio.getAttribute("value"))).toEqual(
    moods.map((mood) => mood.key),
  );
  for (const mood of moods) {
    const radio = within(group).getByRole("radio", { name: mood.label });
    const swatch = radio.parentElement!.querySelector('[aria-hidden="true"]');
    expect(swatch).toHaveStyle({ backgroundColor: mood.color });
  }
  const share = screen.getByRole("button", { name: "Share care" });
  expect(share).toBeDisabled();
  fireEvent.click(within(group).getByRole("radio", { name: "Low · Lavender" }));
  expect(share).toBeEnabled();
});
it("shows saved Hydrangea moods as a swatch with the colour name today and in history", async () => {
  const p = setup("hydrangea");
  p.plant.entries = [
    { ...entryFixture(), author_id: 2, payload: { mood: "tender" } },
  ];
  load.mockResolvedValue({
    entries: [history({ mood: "energized" }), { ...history({ mood: "unknown" }), id: 49 }],
    error: null,
  });
  render(<FlowerSheet {...p} />);
  const today = screen.getByRole("region", { name: "Today's entries" });
  const partner = within(today).getByRole("article", { name: "Partner" });
  const tender = within(partner).getByText("Tender · Pink");
  const todaySwatch = tender.querySelector('[data-mood-swatch="tender"]');
  expect(todaySwatch).toHaveAttribute("aria-hidden", "true");
  expect(todaySwatch).toHaveStyle({ backgroundColor: "#d88798" });
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  const past = screen.getByRole("region", { name: "Flower history" });
  const energized = await within(past).findByText("Energized · Orange");
  expect(
    energized.querySelector('[data-mood-swatch="energized"]'),
  ).toHaveStyle({ backgroundColor: "#d9854f" });
  const unknown = within(past).getByText("Mood saved");
  expect(unknown.querySelector("[data-mood-swatch]")).toBeNull();
});
it("keeps Daisy history answers without exposing raw question ids", async () => {
  const p = setup("daisy");
  load.mockResolvedValue({
    entries: [history({ text: "A slow breakfast.", question_id: "light-042" })],
    error: null,
  });
  render(<FlowerSheet {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  const past = screen.getByRole("region", { name: "Flower history" });
  expect(await within(past).findByText("A slow breakfast.")).toBeInTheDocument();
  expect(past).not.toHaveTextContent("light-042");
  expect(past).not.toHaveTextContent(/Question/);
});
it.each(["rose", "marigold"] as const)("offers partner replies on %s today and bloomed history without requiring own care", async type => {
  const state = gardenFixture();
  const plant = state.plants[0];
  plant.flower.type_key = type;
  plant.entries = [{ ...entryFixture(), author_id: 2 }];
  load.mockResolvedValue({ entries: [history({ text: "Earlier partner note" })], error: null });
  const props = { state, plant, item: state.catalog.find(item => item.type_key === type)!, now: Date.parse(state.server_now), busy: false, mutate: vi.fn() };
  const { rerender } = render(<FlowerSheet {...props} />);
  const today = screen.getByRole("region", { name: "Today's entries" });
  expect(within(today).getByRole("textbox", { name: "Reply" })).toBeInTheDocument();
  expect(props.mutate).not.toHaveBeenCalled();
  plant.flower.first_bloom_at = state.server_now;
  rerender(<FlowerSheet {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  const past = screen.getByRole("region", { name: "Flower history" });
  expect(await within(past).findByRole("textbox", { name: "Reply" })).toBeInTheDocument();
});

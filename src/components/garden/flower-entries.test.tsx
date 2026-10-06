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
  const boxes = within(group).getAllByRole("checkbox");
  expect(boxes.map((box) => box.getAttribute("value"))).toEqual([
    ...moods.map((mood) => mood.key),
    "other",
  ]);
  for (const mood of moods) {
    const box = within(group).getByRole("checkbox", { name: mood.label });
    const swatch = box.parentElement!.querySelector('[aria-hidden="true"]');
    expect(swatch).toHaveStyle({ backgroundColor: mood.color });
  }
  const share = screen.getByRole("button", { name: "Share care" });
  expect(share).toBeDisabled();
  fireEvent.click(within(group).getByRole("checkbox", { name: "Low · Lavender" }));
  expect(share).toBeEnabled();
});
it("lets a member pick up to two colors in order, with an optional note", async () => {
  const p = setup("hydrangea");
  p.mutate.mockResolvedValue({ saved: true, error: null });
  render(<FlowerSheet {...p} />);
  const group = screen.getByRole("group", { name: "How are you feeling?" });
  fireEvent.click(within(group).getByRole("checkbox", { name: "Tender · Pink" }));
  fireEvent.click(within(group).getByRole("checkbox", { name: "Tense · Red" }));
  expect(within(group).getByRole("checkbox", { name: "Calm · Blue" })).toBeDisabled();
  expect(within(group).getByRole("checkbox", { name: "Tender · Pink" })).toBeChecked();
  // Unchecking the main color promotes the accent.
  fireEvent.click(within(group).getByRole("checkbox", { name: "Tender · Pink" }));
  expect(within(group).getByRole("checkbox", { name: "Calm · Blue" })).toBeEnabled();
  fireEvent.click(within(group).getByRole("checkbox", { name: "Calm · Blue" }));
  fireEvent.change(screen.getByLabelText("Briefly, why?"), { target: { value: "long day, soft evening" } });
  fireEvent.click(screen.getByRole("button", { name: "Share care" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  expect(p.mutate).toHaveBeenCalledWith({
    kind: "submit",
    flowerId: p.plant.flower.id,
    payload: { mood: "tense", mood2: "calm", note: "long day, soft evening" },
  });
});
it("requires a short note with Other and keeps Other exclusive of colors", () => {
  const p = setup("hydrangea");
  render(<FlowerSheet {...p} />);
  const group = screen.getByRole("group", { name: "How are you feeling?" });
  fireEvent.click(within(group).getByRole("checkbox", { name: "Calm · Blue" }));
  fireEvent.click(within(group).getByRole("checkbox", { name: "Other" }));
  expect(within(group).getByRole("checkbox", { name: "Calm · Blue" })).not.toBeChecked();
  const share = screen.getByRole("button", { name: "Share care" });
  expect(share).toBeDisabled();
  expect(screen.getByLabelText("Briefly, why?")).toBeRequired();
  fireEvent.change(screen.getByLabelText("Briefly, why?"), { target: { value: "  " } });
  expect(share).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Briefly, why?"), { target: { value: "somewhere between" } });
  expect(share).toBeEnabled();
  fireEvent.click(within(group).getByRole("checkbox", { name: "Joyful · Yellow" }));
  expect(within(group).getByRole("checkbox", { name: "Other" })).not.toBeChecked();
  expect(screen.getByLabelText("Briefly, why?")).not.toBeRequired();
});
it("shows a two-color pick, an Other pick and notes in today's entries", () => {
  const p = setup("hydrangea");
  p.plant.entries = [
    { ...entryFixture(), payload: { mood: "calm", mood2: "joyful", note: "sunny but sleepy" } },
    { ...entryFixture(), id: 2, author_id: 2, payload: { mood: "other", note: "hard to name" } },
  ];
  render(<FlowerSheet {...p} />);
  const today = screen.getByRole("region", { name: "Today's entries" });
  expect(within(today).getByText("Calm · Blue + Joyful · Yellow")).toBeInTheDocument();
  expect(within(today).getByText("sunny but sleepy")).toBeInTheDocument();
  expect(within(today).getByText("Other")).toBeInTheDocument();
  expect(within(today).getByText("hard to name")).toBeInTheDocument();
  expect(today.querySelectorAll('[data-mood-swatch="calm"], [data-mood-swatch="joyful"]')).toHaveLength(2);
  expect(screen.getByRole("img", { name: "Today's mood blend: Calm · Blue + Joyful · Yellow and Other" })).toBeInTheDocument();
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

it("keeps mature mood picking optional and uses held-over colors without claiming today's care", async () => {
  const p = setup("hydrangea");
  p.plant.flower.first_bloom_at = p.state.server_now;
  p.plant.flower.growth_units = 7;
  p.plant.hydrangea_moods = ["calm", "tense"];
  p.mutate.mockResolvedValue({ saved: true, error: null });
  const { container } = render(<FlowerSheet {...p} />);
  expect(container.querySelector('[data-mood-tone="first"]')).toHaveAttribute("fill", "#6f9eab");
  expect(container.querySelector('[data-mood-tone="second"]')).toHaveAttribute("fill", "#b86b61");
  expect(screen.queryByText("Cared today")).not.toBeInTheDocument();
  expect(screen.queryByText("Your turn")).not.toBeInTheDocument();
  expect(screen.getByText(/without growth, streak or achievement credit/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Tender · Pink" }));
  fireEvent.click(screen.getByRole("button", { name: "Save mood" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  expect(p.mutate).toHaveBeenCalledWith({ kind: "submit", flowerId: p.plant.flower.id, payload: { mood: "tender" } });
  expect(screen.queryByText("That’s everything for today")).not.toBeInTheDocument();
});

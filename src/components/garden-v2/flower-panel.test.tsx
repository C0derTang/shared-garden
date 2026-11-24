import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v2EntryFixture, v2GardenFixture } from "@/test/garden-v2-fixture";
import type { GardenState, Plant } from "@/lib/garden-v2/model";

const api = vi.hoisted(() => ({
  loadFlowerHistoryV2: vi.fn(),
  readRepliesV2: vi.fn(),
  saveReplyV2: vi.fn(),
}));
vi.mock("@/lib/garden-v2/actions", () => api);
// The legacy reply actions are the thread's default; the new garden passes its own.
vi.mock("@/lib/replies/actions", () => ({ readReplies: vi.fn(), saveReply: vi.fn() }));

const { FlowerPanel } = await import("./flower-panel");

const NOW = Date.parse("2026-11-02T17:05:00Z");

function setup(type: Plant["flower"]["type_key"], patch: (plant: Plant, state: GardenState) => void = () => {}) {
  const state = v2GardenFixture();
  const plant = state.plants[0]!;
  plant.flower.type_key = type;
  plant.entries = [];
  plant.member1_submitted = false;
  if (type === "dandelion") plant.flower.shared_wish = "A synthetic wish";
  patch(plant, state);
  const item = state.catalog.find((c) => c.type_key === type)!;
  const mutate = vi.fn().mockResolvedValue({ state, saved: true, error: null });
  render(<FlowerPanel plant={plant} state={state} item={item} now={NOW} busy={false} mutate={mutate} />);
  return { mutate, plant, state };
}

beforeEach(() => {
  api.loadFlowerHistoryV2.mockReset().mockResolvedValue({ entries: [], error: null });
  api.readRepliesV2.mockReset().mockResolvedValue({ replies: [], error: null });
  api.saveReplyV2.mockReset();
});

describe("FlowerPanel", () => {
  it("shows growth as x of y, who cared, and shares today's note", async () => {
    const user = userEvent.setup();
    const { mutate, plant } = setup("rose", (p) => (p.flower.growth_units = 2));
    expect(screen.getByRole("progressbar", { name: /growth/ })).toHaveAttribute("aria-valuetext", "2 of 5 growth");
    expect(screen.getByText(/Nothing is ever lost/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Who has cared today" })).getByText(/you · not yet/)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Care" }), "A synthetic note");
    await user.click(screen.getByRole("button", { name: "share" }));
    expect(mutate).toHaveBeenCalledWith({ kind: "submit", flowerId: plant.flower.id, payload: { text: "A synthetic note" } });
    expect(await screen.findByText(/can see it now/)).toBeInTheDocument();
  });

  it("shows the partner's entry with a reply box, and your entry with its edit window", async () => {
    const user = userEvent.setup();
    const { mutate } = setup("marigold", (p) => {
      p.entries = [
        { ...v2EntryFixture(), id: 7, payload: { text: "Mine" } },
        { ...v2EntryFixture(), id: 8, author_id: 2, payload: { text: "Theirs" }, can_edit: false },
      ];
      p.member1_submitted = true;
      p.member2_submitted = true;
    });
    const partner = screen.getByRole("article", { name: "Partner" });
    expect(within(partner).getByText("Theirs")).toBeInTheDocument();
    expect(await within(partner).findByRole("textbox", { name: "Reply" })).toBeInTheDocument();
    const you = screen.getByRole("article", { name: "You" });
    await user.click(within(you).getByRole("button", { name: "edit" }));
    const field = within(you).getByRole("textbox", { name: "Care" });
    await user.clear(field);
    await user.type(field, "Mine, edited");
    await user.click(within(you).getByRole("button", { name: "save edit" }));
    expect(mutate).toHaveBeenCalledWith({ kind: "edit", entryId: 7, payload: { text: "Mine, edited" } });
  });

  it("asks today's Daisy question", async () => {
    const user = userEvent.setup();
    const { mutate } = setup("daisy", (p) => {
      p.daisy_question = { garden_day: "2026-11-02", ordinal: 1, question_id: "q-1", category: "deeper", prompt: "A synthetic question?", assigned_at: "2026-11-02T12:00:00Z" };
    });
    expect(screen.getByRole("region", { name: "Question of the day" })).toHaveTextContent("A synthetic question?");
    await user.type(screen.getByRole("textbox", { name: "Care" }), "An answer");
    await user.click(screen.getByRole("button", { name: "share" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ payload: { text: "An answer", question_id: "q-1" } }));
  });

  it("picks the Hydrangea's color of the day", async () => {
    const user = userEvent.setup();
    const { mutate } = setup("hydrangea", (p) => (p.hydrangea_picks = [null, { mood: "tender" }]));
    expect(screen.getByRole("region", { name: "Color of the day" })).toHaveTextContent("Tender · Pink");
    await user.click(screen.getByRole("checkbox", { name: "Calm · Blue" }));
    await user.click(screen.getByRole("checkbox", { name: "Low · Lavender" }));
    expect(screen.getByRole("checkbox", { name: "Tense · Red" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "share" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ payload: { mood: "calm", mood2: "low" } }));
  });

  it("keeps the Moonflower closed outside its hours, with the draft kept", async () => {
    const user = userEvent.setup();
    const { mutate } = setup("moonflower");
    expect(within(screen.getByRole("region", { name: "Who has cared today" })).getByText(/you · opens at 10 p.m./)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Care" }), "A late thought");
    expect(screen.getByText(/Moonflower opens from 10 p.m. to 4 a.m./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "share" })).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("blows a bloomed Dandelion's seeds after a confirmation", async () => {
    const user = userEvent.setup();
    const { mutate, plant } = setup("dandelion", (p) => {
      p.flower.growth_units = 5;
      p.flower.first_bloom_at = "2026-11-02T12:00:00Z";
      p.flower.first_bloom_day = "2026-11-01";
    });
    expect(screen.getByRole("region", { name: "Our shared wish" })).toHaveTextContent("A synthetic wish");
    await user.click(screen.getByRole("button", { name: "our wish came true" }));
    expect(mutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "blow the seeds" }));
    expect(mutate).toHaveBeenCalledWith({ kind: "fulfillDandelion", flowerId: plant.flower.id });
  });

  it.each(["sunflower", "bluebell", "peony"] as const)("shows %s growing, with its activity coming soon", (type) => {
    setup(type);
    expect(screen.getByRole("region", { name: "Coming soon" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "share" })).toBeNull();
  });

  it("checks in a Cactus with one tap and reads earlier days on request", async () => {
    const user = userEvent.setup();
    const { mutate } = setup("cactus");
    await user.click(screen.getByRole("button", { name: "I’m here" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ kind: "submit", payload: {} }));
    api.loadFlowerHistoryV2.mockResolvedValue({ entries: [{ ...v2EntryFixture(), id: 3, garden_day: "2026-11-01", author_id: 2, payload: {} }], error: null });
    await act(async () => user.click(screen.getByRole("button", { name: "read earlier days" })));
    expect(await screen.findByText("Checked in. I’m here.")).toBeInTheDocument();
  });
});

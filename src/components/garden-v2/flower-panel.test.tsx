import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v2EntryFixture, v2GardenFixture } from "@/test/garden-v2-fixture";
import type { CustomQuestion, GardenState, Plant } from "@/lib/garden-v2/model";

const api = vi.hoisted(() => ({
  loadFlowerHistoryV2: vi.fn(),
  readRepliesV2: vi.fn(),
  saveReplyV2: vi.fn(),
}));
vi.mock("@/lib/garden-v2/actions", () => api);
// The legacy reply actions are the thread's default; the new garden passes its own.
vi.mock("@/lib/replies/actions", () => ({ readReplies: vi.fn(), saveReply: vi.fn() }));
const peonyApi = vi.hoisted(() => ({ readPeonyV2: vi.fn(), mutatePeonyV2: vi.fn() }));
vi.mock("@/lib/garden-v2/peony-actions", () => peonyApi);
const media = vi.hoisted(() => ({ mediaRequest: vi.fn() }));
vi.mock("@/lib/media/browser", async (original) => ({
  ...(await original<typeof import("@/lib/media/browser")>()),
  mediaRequest: media.mediaRequest,
}));

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
  media.mediaRequest.mockReset().mockImplementation(async (operation: string) => (operation === "read" ? { url: "blob:synthetic-signed" } : {}));
  peonyApi.readPeonyV2.mockReset().mockResolvedValue({ state: null, error: null });
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

  it("offers a waiting Sunflower as the next flower, but never the Peony", async () => {
    const user = userEvent.setup();
    const { mutate } = setup("rose", (rose, state) => {
      state.plants.push(
        { ...structuredClone(rose), flower: { ...rose.flower, id: "00000000-0000-4000-8000-0000000000ab", spot: 2, type_key: "peony" } },
        { ...structuredClone(rose), flower: { ...rose.flower, id: "00000000-0000-4000-8000-0000000000aa", spot: 3, type_key: "sunflower" } },
      );
    });
    await user.type(screen.getByRole("textbox", { name: "Care" }), "A synthetic note");
    await user.click(screen.getByRole("button", { name: "share" }));
    expect(mutate).toHaveBeenCalled();
    // The Sunflower still waits for you (the panel offers it when it can open flowers).
    expect(await screen.findByText(/can see it now/)).toBeInTheDocument();
    expect(screen.queryByText(/That’s everything for today/)).toBeNull();
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

});

const DAILY = { garden_day: "2026-11-02", ordinal: 1, question_id: "light-001", category: "light" as const, prompt: "A synthetic daily question?", assigned_at: "2026-11-02T12:00:00Z" };
function question(patch: Partial<CustomQuestion> = {}): CustomQuestion {
  return {
    id: 9,
    asker_id: 2,
    addressee_id: 1,
    prompt: "A synthetic partner question?",
    revision: 1,
    question_key: "custom-9-r1",
    created_at: "2026-11-02T16:00:00Z",
    updated_at: "2026-11-02T16:00:00Z",
    locked: false,
    ...patch,
  };
}
function daisy(patch: (plant: Plant) => void = () => {}) {
  return setup("daisy", (p) => {
    p.daisy_question = DAILY;
    patch(p);
  });
}

describe("Daisy questions (#212)", () => {
  it("answers the partner's own question in place of the daily one", async () => {
    const user = userEvent.setup();
    const { mutate } = daisy((p) => (p.daisy_custom_questions = [question()]));
    const callout = screen.getByRole("region", { name: "Question of the day" });
    expect(callout).toHaveTextContent("partner asks");
    expect(callout).toHaveTextContent("A synthetic partner question?");
    expect(callout).not.toHaveTextContent("A synthetic daily question?");
    await user.type(screen.getByRole("textbox", { name: "Answer your partner's question" }), "An answer");
    await user.click(screen.getByRole("button", { name: "share" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ kind: "submit", payload: { text: "An answer", question_id: "custom-9-r1" } }));
  });

  it("asks the partner a question of 1 to 300 characters", async () => {
    const user = userEvent.setup();
    const { mutate, plant } = daisy();
    const ask = screen.getByRole("region", { name: "Your question for partner" });
    await user.click(within(ask).getByRole("button", { name: "ask partner your own question" }));
    const field = within(ask).getByRole("textbox", { name: "your question for partner" });
    await user.click(field);
    await user.paste("q".repeat(301));
    expect(within(ask).getByRole("button", { name: "ask" })).toBeDisabled();
    expect(within(ask).getByText(/301 \/ 300/)).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, "What made you smile?");
    await user.click(within(ask).getByRole("button", { name: "ask" }));
    expect(mutate).toHaveBeenCalledWith({ kind: "askDaisy", flowerId: plant.flower.id, prompt: "What made you smile?" });
    expect(within(ask).queryByRole("textbox")).toBeNull();
  });

  it("edits or removes your question until the partner answers", async () => {
    const user = userEvent.setup();
    const { mutate, plant } = daisy((p) => (p.daisy_custom_questions = [question({ asker_id: 1, addressee_id: 2, prompt: "My synthetic question?" })]));
    const ask = screen.getByRole("region", { name: "Your question for partner" });
    expect(ask).toHaveTextContent("you asked partner");
    expect(ask).toHaveTextContent("My synthetic question?");
    // You still answer the daily question: nobody asked you one.
    expect(screen.getByRole("region", { name: "Question of the day" })).toHaveTextContent("today’s light question");
    await user.click(within(ask).getByRole("button", { name: "edit" }));
    const field = within(ask).getByRole("textbox", { name: "your question for partner" });
    expect(field).toHaveValue("My synthetic question?");
    await user.clear(field);
    await user.type(field, "A better question?");
    await user.click(within(ask).getByRole("button", { name: "save question" }));
    expect(mutate).toHaveBeenCalledWith({ kind: "askDaisy", flowerId: plant.flower.id, prompt: "A better question?" });
    await user.click(within(ask).getByRole("button", { name: "remove" }));
    expect(mutate).toHaveBeenLastCalledWith({ kind: "removeDaisyQuestion", flowerId: plant.flower.id });
  });

  it("shows a rejected question without losing the draft", async () => {
    const user = userEvent.setup();
    const { mutate } = daisy();
    mutate.mockResolvedValueOnce({ state: null, saved: false, error: "Your partner has already answered, so today's question stays as it is." });
    const ask = screen.getByRole("region", { name: "Your question for partner" });
    await user.click(within(ask).getByRole("button", { name: "ask partner your own question" }));
    await user.type(within(ask).getByRole("textbox", { name: "your question for partner" }), "Too late?");
    await user.click(within(ask).getByRole("button", { name: "ask" }));
    expect(await within(ask).findByRole("alert")).toHaveTextContent(/already answered/);
    expect(within(ask).getByRole("textbox", { name: "your question for partner" })).toHaveValue("Too late?");
  });

  it("locks your question once the partner has answered it", () => {
    daisy((p) => {
      p.daisy_custom_questions = [question({ asker_id: 1, addressee_id: 2, prompt: "My synthetic question?", locked: true })];
      p.member2_submitted = true;
      p.entries = [
        {
          ...v2EntryFixture(),
          id: 8,
          author_id: 2,
          can_edit: false,
          daisy_assignment_day: "2026-11-02",
          daisy_custom_question_id: 9,
          payload: { text: "Their answer", question_id: "custom-9-r1" },
          question: { kind: "custom", prompt: "My synthetic question?", asked_by: 1 },
        },
      ];
    });
    const ask = screen.getByRole("region", { name: "Your question for partner" });
    expect(ask).toHaveTextContent("answered · it stays as asked");
    expect(within(ask).queryByRole("button")).toBeNull();
    const card = screen.getByRole("article", { name: "Partner" });
    expect(card).toHaveTextContent("you asked");
    expect(card).toHaveTextContent("My synthetic question?");
    expect(card).toHaveTextContent("Their answer");
  });

  it("offers no question once the partner answered the daily one", () => {
    daisy((p) => {
      p.member2_submitted = true;
      p.entries = [
        {
          ...v2EntryFixture(),
          id: 8,
          author_id: 2,
          can_edit: false,
          daisy_assignment_day: "2026-11-02",
          payload: { text: "Their answer", question_id: "light-001" },
          question: { kind: "daily", prompt: DAILY.prompt, category: "light", question_id: "light-001" },
        },
      ];
    });
    expect(screen.queryByRole("region", { name: "Your question for partner" })).toBeNull();
    expect(screen.getByRole("article", { name: "Partner" })).toHaveTextContent("the light question");
  });

  it("asks you to reread a question that changed under your draft", async () => {
    const user = userEvent.setup();
    const state = v2GardenFixture();
    const plant = state.plants[0]!;
    Object.assign(plant, { entries: [], member1_submitted: false, daisy_question: DAILY });
    plant.flower.type_key = "daisy";
    const item = state.catalog.find((c) => c.type_key === "daisy")!;
    const mutate = vi.fn().mockResolvedValue({ state, saved: true, error: null });
    const view = (p: Plant) => <FlowerPanel plant={p} state={state} item={item} now={NOW} busy={false} mutate={mutate} />;
    const { rerender } = render(view(plant));
    await user.type(screen.getByRole("textbox", { name: "Care" }), "An answer to the daily one");
    rerender(view({ ...plant, daisy_custom_questions: [question()] }));
    expect(screen.getByText(/Your question just changed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "share" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "answer this question" }));
    await user.click(screen.getByRole("button", { name: "share" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ payload: { text: "An answer to the daily one", question_id: "custom-9-r1" } }));
  });

  it("keeps the original question when editing an answer", async () => {
    const user = userEvent.setup();
    const { mutate } = daisy((p) => {
      p.daisy_custom_questions = [question({ locked: true })];
      p.member1_submitted = true;
      p.entries = [
        {
          ...v2EntryFixture(),
          id: 7,
          daisy_assignment_day: "2026-11-02",
          daisy_custom_question_id: 9,
          payload: { text: "Mine", question_id: "custom-9-r1" },
          question: { kind: "custom", prompt: "A synthetic partner question?", asked_by: 2 },
        },
      ];
    });
    const you = screen.getByRole("article", { name: "You" });
    expect(you).toHaveTextContent("partner asked");
    await user.click(within(you).getByRole("button", { name: "edit" }));
    const field = within(you).getByRole("textbox", { name: "Care" });
    await user.clear(field);
    await user.type(field, "Mine, edited");
    await user.click(within(you).getByRole("button", { name: "save edit" }));
    expect(mutate).toHaveBeenCalledWith({ kind: "edit", entryId: 7, payload: { text: "Mine, edited", question_id: "custom-9-r1" } });
  });

  it("labels earlier answers with their questions", async () => {
    const user = userEvent.setup();
    daisy();
    api.loadFlowerHistoryV2.mockResolvedValue({
      entries: [
        {
          ...v2EntryFixture(),
          id: 3,
          garden_day: "2026-11-01",
          author_id: 2,
          daisy_assignment_day: "2026-11-01",
          payload: { text: "An earlier answer", question_id: "custom-4-r1" },
          question: { kind: "custom", prompt: "An earlier question?", asked_by: 1 },
        },
      ],
      error: null,
    });
    await act(async () => user.click(screen.getByRole("button", { name: "read earlier days" })));
    const history = screen.getByRole("region", { name: "History" });
    expect(await within(history).findByText("An earlier question?")).toBeInTheDocument();
    expect(history).toHaveTextContent("you asked");
  });

  it("hides the questions on a bloomed Daisy", () => {
    setup("daisy", (p) => {
      p.flower.growth_units = 7;
      p.flower.first_bloom_at = "2026-11-01T12:00:00Z";
      p.flower.first_bloom_day = "2026-11-01";
    });
    expect(screen.queryByRole("region", { name: "Question of the day" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Your question for partner" })).toBeNull();
  });
});

describe("FlowerPanel, continued", () => {
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

  it.each([
    ["sunflower", "Share a Sunflower photo"],
    ["bluebell", "Share a Bluebell voice memo"],
  ] as const)("gives the %s its own activity in the panel", (type, form) => {
    setup(type);
    expect(screen.getByRole("form", { name: form })).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.getByText(/Nothing is ever lost/)).toBeInTheDocument();
  });

  it("shows a shared photo through the new garden's private read, with replace in its window", async () => {
    setup("sunflower", (p) => {
      p.entries = [
        { ...v2EntryFixture(), id: 7, payload: { media_id: "00000000-0000-4000-8000-00000000f001" } },
        { ...v2EntryFixture(), id: 8, author_id: 2, payload: { media_id: "00000000-0000-4000-8000-00000000f002" }, can_edit: false },
      ];
      p.member1_submitted = true;
      p.member2_submitted = true;
    });
    expect(await screen.findAllByAltText("Shared Sunflower photo")).toHaveLength(2);
    expect(media.mediaRequest).toHaveBeenCalledWith("read", { mediaId: "00000000-0000-4000-8000-00000000f002", garden: "v2" }, expect.anything());
    expect(screen.getByRole("button", { name: "replace photo" })).toBeInTheDocument();
  });

  it("lists the Peony's four milestones instead of daily cards", async () => {
    setup("peony");
    expect(await screen.findByRole("region", { name: "Peony milestones" })).toBeInTheDocument();
    expect(screen.getByText(/grows by one each time you finish a milestone together/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Today" })).toBeNull();
    expect(screen.queryByRole("region", { name: "History" })).toBeNull();
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

vi.mock("@/lib/settings/actions", () => ({ readSettings: vi.fn(), saveSetting: vi.fn() }));
vi.mock("@/lib/peony/actions", () => ({
  readPeony: vi.fn(),
  mutatePeony: vi.fn(),
}));
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { entryFixture, gardenFixture } from "@/test/garden-fixture";
import type { Entry, GardenState, Plant } from "@/lib/garden/model";
import type { FlowerType } from "./flower-sprite";
const { refreshGarden, mutateGarden, loadFlowerHistory, read } = vi.hoisted(() => ({
  refreshGarden: vi.fn(),
  mutateGarden: vi.fn(),
  loadFlowerHistory: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/lib/garden/actions", () => ({ refreshGarden, mutateGarden, loadFlowerHistory }));
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
vi.mock("@/lib/media/browser", async (original) => ({
  ...(await original<typeof import("@/lib/media/browser")>()),
  mediaRequest: read,
}));
import { FlowerSheet } from "./flower-sheet";
import { GardenClient } from "./garden-client";
beforeEach(() => {
  vi.clearAllMocks();
  read.mockImplementation(async (_operation, body) => ({
    url: `https://example.test/${body.mediaId}`,
    durationMs: 5000,
  }));
});

const payloads: Partial<Record<FlowerType, Record<string, string>>> = {
  cactus: {},
  hydrangea: { mood: "calm" },
  sunflower: { media_id: "photo" },
  bluebell: { media_id: "memo" },
  tulip: { title: "A song", artist: "An artist", url: "https://example.com/song" },
};
function entry(author: 1 | 2, type: FlowerType): Entry {
  return {
    ...entryFixture(),
    id: author,
    author_id: author,
    payload: payloads[type] ?? { text: `Note from member ${author}` },
    can_edit: author === 1,
  };
}
function sheet(type: FlowerType, you: boolean, partner: boolean) {
  const state = gardenFixture();
  state.moonflower_open = true;
  const plant = state.plants[0];
  plant.flower.type_key = type;
  if (type === "dandelion") plant.flower.shared_wish = "See the sea";
  if (type === "daisy")
    plant.daisy_question = {
      garden_day: state.garden_day,
      ordinal: 1,
      question_id: "q",
      category: "light",
      prompt: "What made you smile?",
      assigned_at: state.server_now,
    };
  plant.member1_submitted = you;
  plant.member2_submitted = partner;
  plant.entries = [
    ...(partner ? [entry(2, type)] : []),
    ...(you ? [entry(1, type)] : []),
  ];
  return {
    plant,
    state,
    item: state.catalog.find((item) => item.type_key === type)!,
    now: Date.parse(state.server_now),
    busy: false,
    mutate: mutateGarden,
  };
}
const types: FlowerType[] = [
  "rose", "cactus", "tulip", "marigold", "daisy", "hydrangea", "sunflower",
  "snapdragon", "moonflower", "bluebell", "dandelion", "forget-me-not",
];
const states = [
  ["neither", false, false],
  ["you-only", true, false],
  ["partner-only", false, true],
  ["both", true, true],
] as const;
it.each(types.flatMap((type) => states.map(([name, you, partner]) => [type, name, you, partner] as const)))(
  "renders the %s You and Partner cards when %s cared",
  (type, _name, you, partner) => {
    render(<FlowerSheet {...sheet(type, you, partner)} />);
    const today = screen.getByRole("region", { name: "Today's entries" });
    // The cards are the region's top-level articles (a song player nests its own).
    const cards = Array.from(today.querySelectorAll<HTMLElement>(":scope > div > article"));
    const names = cards.map((card) => card.querySelector("h4")?.textContent);
    expect(cards.map((card) => within(today).getByRole("article", { name: names[cards.indexOf(card)]! }))).toEqual(cards);
    expect(names).toEqual(partner ? ["Partner", "You"] : ["You", "Partner"]);
    const partnerCard = cards[names.indexOf("Partner")];
    const yourCard = cards[names.indexOf("You")];
    expect(partnerCard).toHaveTextContent(partner ? "Cared today" : "Not yet today");
    expect(yourCard).toHaveTextContent(you ? "Cared today" : "Your turn");
    // Your empty card holds the form; the partner card never does.
    expect(within(partnerCard).queryByRole("form")).toBeNull();
    if (you) expect(within(yourCard).queryByRole("form")).toBeNull();
    else expect(within(yourCard).getByRole("form")).toBeInTheDocument();
    // Your entry keeps its edit window; the partner entry has no read-only label.
    expect(within(yourCard).queryAllByRole("button", { name: "Edit your entry" })).toHaveLength(you ? 1 : 0);
    expect(today).not.toHaveTextContent("Read-only");
    if (partner && !payloads[type])
      expect(partnerCard).toHaveTextContent("Note from member 2");
  },
);

it("shows the growth rule and a segmented bar outside Details", () => {
  const props = sheet("rose", false, false);
  props.plant.flower.growth_units = 3;
  render(<FlowerSheet {...props} />);
  expect(screen.getByText(/\+1 at 4 a\.m\. when you both care/)).toBeVisible();
  const bar = screen.getByRole("progressbar", { name: "Rose progress" });
  expect(bar).toHaveAttribute("aria-valuetext", "3 of 5 growth units");
  expect(bar.querySelectorAll('[data-filled="true"]')).toHaveLength(3);
  expect(bar.children).toHaveLength(5);
});

function withMarigold(props: ReturnType<typeof sheet>) {
  const marigold: Plant = structuredClone(props.plant);
  marigold.flower = { ...marigold.flower, id: "marigold", spot: 4, type_key: "marigold" };
  marigold.entries = [];
  props.state.plants.push(marigold);
  return props;
}

it("offers the next due flower after a share and moves focus to it", async () => {
  const props = withMarigold(sheet("rose", false, false));
  const onVisit = vi.fn();
  mutateGarden.mockResolvedValue({ saved: true, state: props.state, error: null });
  render(<FlowerSheet {...props} onVisit={onVisit} onClose={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Thanks for today" } });
  fireEvent.click(screen.getByRole("button", { name: "Share care" }));
  const next = await screen.findByRole("button", { name: "Next: Marigold" });
  expect(screen.getByRole("status")).toHaveTextContent("Saved · your partner can see it now.");
  await waitFor(() => expect(next).toHaveFocus());
  fireEvent.click(next);
  expect(onVisit).toHaveBeenCalledExactlyOnceWith(4);
});

it("ends the round calmly with Close when nothing else is due", async () => {
  const props = sheet("rose", false, false);
  const onClose = vi.fn();
  mutateGarden.mockResolvedValue({ saved: true, state: props.state, error: null });
  render(<FlowerSheet {...props} onVisit={vi.fn()} onClose={onClose} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Thanks" } });
  fireEvent.click(screen.getByRole("button", { name: "Share care" }));
  expect(await screen.findByText(/That’s everything for today/)).toBeInTheDocument();
  const close = screen.getByRole("button", { name: "Close and return to the garden" });
  await waitFor(() => expect(close).toHaveFocus());
  fireEvent.click(close);
  expect(onClose).toHaveBeenCalledOnce();
});

it("confirms an edit without offering a next flower", async () => {
  const props = withMarigold(sheet("rose", true, false));
  mutateGarden.mockResolvedValue({ saved: true, state: props.state, error: null });
  render(<FlowerSheet {...props} onVisit={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit your entry" }));
  const you = screen.getByRole("article", { name: "You" });
  expect(within(you).getByRole("form", { name: "Edit your care" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save edit" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Saved · your partner can see it now.");
  expect(screen.queryByRole("button", { name: /Next:/ })).toBeNull();
});

it("carries the garden from one flower sheet to the next after sharing", async () => {
  const state: GardenState = withMarigold(sheet("rose", false, false)).state;
  refreshGarden.mockResolvedValue({ state, error: null });
  const saved = structuredClone(state);
  saved.plants[0].member1_submitted = true;
  saved.plants[0].entries = [entry(1, "rose")];
  mutateGarden.mockResolvedValue({ saved: true, state: saved, error: null });
  const user = userEvent.setup();
  render(<GardenClient initial={{ state, error: null }} guideEnabled={false} />);
  await user.click(screen.getByRole("button", { name: /Rose, spot 1/ }));
  await user.type(screen.getByRole("textbox"), "A walk");
  await user.click(screen.getByRole("button", { name: "Share care" }));
  await user.click(await screen.findByRole("button", { name: "Next: Marigold" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: "Marigold" })).toBeInTheDocument();
  expect(within(dialog).getByRole("article", { name: "You" })).toHaveTextContent("Your turn");
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Marigold, spot 4/ })).toHaveFocus());
});

vi.mock("@/lib/peony/actions", () => ({ readPeony: vi.fn(), mutatePeony: vi.fn() }));
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { gardenFixture, entryFixture } from "@/test/garden-fixture";
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
import { FlowerSheet } from "./flower-sheet";
import { SeedPicker } from "./seed-picker";
import type { GardenResult } from "@/lib/garden/model";
beforeEach(() => {
  vi.clearAllMocks();
  refreshGarden.mockResolvedValue({ state: gardenFixture(), error: null });
});
it("renders real fixed beds, permanent flowers, clock and selectable empty positions", async () => {
  const user = userEvent.setup();
  render(<GardenClient initial={{ state: gardenFixture(), error: null }} />);
  expect(
    screen.getByRole("button", { name: /Cactus.*0 of 10/ }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Plant in spot/ })).toHaveLength(
    11,
  );
  expect(screen.getByText(/Pacific garden clock/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Plant in spot 9" }));
  const sheet = screen.getByRole("dialog");
  expect(within(sheet).getByText(/Spot 9/)).toBeInTheDocument();
  expect(within(sheet).getByRole("button", { name: /Cactus/ })).toBeDisabled();
  await user.click(within(sheet).getByRole("button", { name: /Rose/ }));
  mutateGarden.mockResolvedValue({
    state: gardenFixture(),
    saved: true,
    error: null,
  });
  await user.click(within(sheet).getByRole("button", { name: "Plant Rose" }));
  expect(mutateGarden).toHaveBeenCalledWith({
    kind: "plant",
    type: "rose",
    spot: 9,
  });
});
it("shows partner care immediately before the current member contributes and escapes entry text", () => {
  const state = gardenFixture();
  const plant = state.plants[0];
  plant.flower.type_key = "rose";
  plant.member2_submitted = true;
  plant.entries = [
    {
      ...entryFixture(),
      author_id: 2,
      can_edit: false,
      payload: { text: "<script>not executable</script>" },
    },
  ];
  render(
    <FlowerSheet
      plant={plant}
      state={state}
      item={state.catalog[1]}
      now={Date.parse(state.server_now)}
      busy={false}
      mutate={mutateGarden}
    />,
  );
  expect(
    screen.getByText("<script>not executable</script>"),
  ).toBeInTheDocument();
  expect(screen.getByText("Partner · cared today")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Edit your entry" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("textbox", { name: "Note about today" }),
  ).toBeInTheDocument();
});
it("preserves the draft after a rejected action and partner refresh; blocks accidental duplicates while saving", async () => {
  const state = gardenFixture();
  const plant = state.plants[0];
  plant.flower.type_key = "rose";
  let complete!: (value: unknown) => void;
  const mutate = vi.fn(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const props = {
    plant,
    state,
    item: state.catalog[1],
    now: Date.parse(state.server_now),
    busy: false,
    mutate: mutate as typeof mutateGarden,
  };
  const view = render(<FlowerSheet {...props} />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Keep this thought" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Share care" }));
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  view.rerender(
    <FlowerSheet {...props} plant={{ ...plant, member2_submitted: true }} />,
  );
  complete({ saved: false, state, error: "The edit window has ended." });
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(/edit window/),
  );
  expect(screen.getByRole("textbox")).toHaveValue("Keep this thought");
  expect(mutate).toHaveBeenCalledTimes(1);
});
it("requires a shared wish before planting a Dandelion and retains it on failure", async () => {
  const state = gardenFixture();
  state.unlocks.push({ type_key: "dandelion", unlocked_at: state.server_now });
  mutateGarden.mockResolvedValue({
    state,
    saved: false,
    error: "Spot no longer available.",
  });
  render(
    <SeedPicker
      state={state}
      spot={12}
      busy={false}
      mutate={mutateGarden}
      onPlanted={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Dandelion/ }));
  expect(
    screen.getByRole("button", { name: "Plant Dandelion" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "One shared wish" }), {
    target: { value: "See a new place" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Plant Dandelion" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Spot no longer available.",
    ),
  );
  expect(mutateGarden).toHaveBeenCalledWith({
    kind: "plant",
    type: "dandelion",
    spot: 12,
    wish: "See a new place",
  });
  expect(screen.getByRole("textbox")).toHaveValue("See a new place");
});
it("shows author edit deadline, makes expired entries read-only, and pages readonly history", async () => {
  const state = gardenFixture();
  const plant = state.plants[0];
  plant.flower.type_key = "rose";
  plant.entries = [entryFixture()];
  plant.member1_submitted = true;
  loadFlowerHistory.mockResolvedValue({
    entries: Array.from({ length: 20 }, (_, i) => ({
      ...entryFixture(),
      id: 40 - i,
    })),
    error: null,
  });
  const props = {
    plant,
    state,
    item: state.catalog[1],
    now: Date.parse(state.server_now),
    busy: false,
    mutate: mutateGarden,
  };
  const view = render(<FlowerSheet {...props} />);
  expect(
    screen.getByRole("button", { name: "Edit your entry" }),
  ).toBeInTheDocument();
  view.rerender(
    <FlowerSheet {...props} now={Date.parse("2026-09-18T17:30:01Z")} />,
  );
  expect(
    screen.queryByRole("button", { name: "Edit your entry" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  await screen.findByRole("button", { name: "Older entries" });
  fireEvent.click(screen.getByRole("button", { name: "Older entries" }));
  await waitFor(() =>
    expect(loadFlowerHistory).toHaveBeenLastCalledWith(plant.flower.id, 21),
  );
});
it("keeps a wish draft visible when another member takes the selected spot", async () => {
  const user = userEvent.setup();
  const state = gardenFixture();
  state.unlocks.push({ type_key: "dandelion", unlocked_at: state.server_now });
  refreshGarden.mockResolvedValue({ state, error: null });
  render(<GardenClient initial={{ state, error: null }} />);
  await user.click(screen.getByRole("button", { name: "Plant in spot 12" }));
  await user.click(screen.getByRole("button", { name: /Dandelion/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "One shared wish" }), {
    target: { value: "Keep the wish" },
  });
  const changed = structuredClone(state);
  changed.server_now = "2026-09-18T17:00:01Z";
  changed.plants.push({
    ...changed.plants[0],
    flower: {
      ...changed.plants[0].flower,
      id: "00000000-0000-4000-8000-000000000012",
      spot: 12,
      type_key: "rose",
    },
  });
  refreshGarden.mockResolvedValue({ state: changed, error: null });
  fireEvent.focus(window);
  await screen.findByText(/Someone planted here/);
  expect(screen.getByRole("textbox", { name: "One shared wish" })).toHaveValue(
    "Keep the wish",
  );
  expect(
    screen.getByRole("button", { name: "Plant Dandelion" }),
  ).toBeDisabled();
});
it("renders the shared Daisy prompt and category, six moods and honest media states", () => {
  const state = gardenFixture();
  const plant = state.plants[0];
  plant.flower.type_key = "daisy";
  plant.daisy_question = {
    garden_day: state.garden_day,
    ordinal: 1,
    question_id: "light-001",
    category: "light",
    prompt: "What small thing made you smile?",
    assigned_at: state.server_now,
  };
  const props = {
    plant,
    state,
    item: state.catalog[4],
    now: Date.parse(state.server_now),
    busy: false,
    mutate: mutateGarden,
  };
  const view = render(<FlowerSheet {...props} />);
  expect(
    screen.getByText("What small thing made you smile?"),
  ).toBeInTheDocument();
  expect(screen.getByText(/LIGHT QUESTION/)).toBeInTheDocument();
  plant.flower.type_key = "hydrangea";
  plant.entries = [
    { ...entryFixture(), payload: { mood: "calm" } },
    { ...entryFixture(), id: 2, author_id: 2, payload: { mood: "joyful" } },
  ];
  view.rerender(<FlowerSheet {...props} item={state.catalog[5]} />);
  expect(
    screen.getByRole("img", { name: /Today's mood blend: Calm.*Joyful/ }),
  ).toBeInTheDocument();
  plant.entries = [];
  view.rerender(<FlowerSheet {...props} item={state.catalog[5]} />);
  expect(screen.getAllByRole("radio")).toHaveLength(6);
  plant.flower.type_key = "bluebell";
  view.rerender(<FlowerSheet {...props} item={state.catalog[9]} />);
  expect(
    screen.getByText(/Voice recording and playback will arrive soon/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Share care" }),
  ).not.toBeInTheDocument();
});
it("keeps an unsaved Moonflower thought when the window closes at rollover", () => {
  const state = gardenFixture();
  state.moonflower_open = true;
  const plant = state.plants[0];
  plant.flower.type_key = "moonflower";
  const props = {
    plant,
    state,
    item: state.catalog[8],
    now: Date.parse(state.server_now),
    busy: false,
    mutate: mutateGarden,
  };
  const view = render(<FlowerSheet {...props} />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Keep a late thought" },
  });
  const next = { ...state, garden_day: "2026-09-19", moonflower_open: false };
  view.rerender(<FlowerSheet {...props} state={next} />);
  expect(screen.getByRole("textbox")).toHaveValue("Keep a late thought");
  expect(screen.getByRole("button", { name: "Share care" })).toBeDisabled();
});
it("reports a history transport error without losing the open flower", async () => {
  const state = gardenFixture();
  loadFlowerHistory.mockRejectedValue(new Error("network"));
  render(
    <FlowerSheet
      plant={state.plants[0]}
      state={state}
      item={state.catalog[0]}
      now={Date.parse(state.server_now)}
      busy={false}
      mutate={mutateGarden}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      /History could not load/,
    ),
  );
  expect(screen.getByRole("button", { name: "Read history" })).toBeEnabled();
});
it("keeps a fresh Cactus check-in one tap across rollover when there is no draft", () => {
  const state = gardenFixture();
  const props = {
    plant: state.plants[0],
    state,
    item: state.catalog[0],
    now: Date.parse(state.server_now),
    busy: false,
    mutate: mutateGarden,
  };
  const view = render(<FlowerSheet {...props} />);
  view.rerender(
    <FlowerSheet {...props} state={{ ...state, garden_day: "2026-09-19" }} />,
  );
  expect(
    screen.queryByRole("button", { name: "Use this draft today" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "I’m here · Check in" }),
  ).toBeEnabled();
});
it("blocks a stale boundary draft until the current day arrives and the author reviews it", async () => {
  const state = gardenFixture();
  const plant = state.plants[0];
  plant.flower.type_key = "rose";
  const mutate = vi.fn().mockResolvedValue({ saved: true, state, error: null });
  const props = {
    plant,
    state,
    item: state.catalog[1],
    now: Date.parse(state.server_now),
    busy: false,
    mutate,
  };
  const view = render(<FlowerSheet {...props} />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Keep and review this note" },
  });
  view.rerender(
    <FlowerSheet {...props} now={Date.parse(state.next_rollover_at)} />,
  );
  expect(screen.getByRole("button", { name: "Share care" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Use this draft today" }),
  ).not.toBeInTheDocument();
  fireEvent.submit(screen.getByRole("form", { name: "Today's care" }));
  expect(mutate).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toHaveValue("Keep and review this note");
  const next = {
    ...state,
    garden_day: "2026-09-19",
    server_now: "2026-09-19T11:00:01Z",
    next_rollover_at: "2026-09-20T11:00:00Z",
  };
  view.rerender(
    <FlowerSheet {...props} state={next} now={Date.parse(next.server_now)} />,
  );
  expect(screen.getByRole("textbox")).toHaveValue("Keep and review this note");
  expect(screen.getByRole("button", { name: "Share care" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Use this draft today" }));
  fireEvent.click(screen.getByRole("button", { name: "Share care" }));
  await waitFor(() =>
    expect(mutate).toHaveBeenCalledExactlyOnceWith({
      kind: "submit",
      flowerId: plant.flower.id,
      payload: { text: "Keep and review this note" },
    }),
  );
});
it("keeps a queued care draft when an in-flight refresh changes the day, then saves only after review", async () => {
  const state = gardenFixture();
  state.plants[0].flower.type_key = "rose";
  refreshGarden.mockResolvedValue({ state, error: null });
  render(<GardenClient initial={{ state, error: null }} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Rose, spot 1/ }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Keep the pending draft" },
  });
  let finishRead!: (value: GardenResult) => void;
  refreshGarden.mockImplementation(
    () =>
      new Promise<GardenResult>((resolve) => {
        finishRead = resolve;
      }),
  );
  fireEvent.focus(window);
  fireEvent.click(screen.getByRole("button", { name: "Share care" }));
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  const next = structuredClone(state);
  next.garden_day = "2026-09-19";
  next.server_now = "2026-09-19T11:00:01Z";
  next.next_rollover_at = "2026-09-20T11:00:00Z";
  await act(async () => {
    refreshGarden.mockResolvedValue({ state: next, error: null });
    finishRead({ state: next, error: null });
  });
  expect(mutateGarden).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toHaveValue("Keep the pending draft");
  expect(screen.getByRole("button", { name: "Share care" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Use this draft today" }));
  mutateGarden.mockResolvedValue({ state: next, saved: true, error: null });
  await user.click(screen.getByRole("button", { name: "Share care" }));
  expect(mutateGarden).toHaveBeenCalledExactlyOnceWith({
    kind: "submit",
    flowerId: state.plants[0].flower.id,
    payload: { text: "Keep the pending draft" },
  });
});

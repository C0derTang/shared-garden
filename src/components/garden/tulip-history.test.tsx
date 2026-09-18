import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { gardenFixture, entryFixture } from "@/test/garden-fixture";
const { loadFlowerHistory } = vi.hoisted(() => ({
  loadFlowerHistory: vi.fn(),
}));
vi.mock("@/lib/garden/actions", () => ({ loadFlowerHistory }));
vi.mock("@/lib/peony/actions", () => ({
  readPeony: vi.fn(),
  mutatePeony: vi.fn(),
}));
import { FlowerSheet } from "./flower-sheet";
it("retains observed replacement when rollover precedes stale first history response", async () => {
  const state = gardenFixture();
  state.server_now = "2026-09-19T10:59:50Z";
  const plant = {
    ...state.plants[0],
    flower: { ...state.plants[0].flower, type_key: "tulip" as const },
  };
  const original = {
    ...entryFixture(),
    original_posted_at: "2026-09-19T10:59:00Z",
    updated_at: "2026-09-19T10:59:00Z",
    payload: {
      title: "Original song",
      artist: "Artist",
      url: "https://example.com/song",
    },
  };
  let resolve!: (value: { entries: (typeof original)[]; error: null }) => void;
  loadFlowerHistory.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const props = {
    state,
    item: state.catalog[2],
    now: Date.parse(state.server_now),
    busy: false,
    mutate: vi.fn(),
  };
  const view = render(
    <FlowerSheet {...props} plant={{ ...plant, entries: [original] }} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  const edited = {
    ...original,
    updated_at: "2026-09-19T10:59:55.000200Z",
    payload: { ...original.payload, title: "Edited song" },
  };
  view.rerender(
    <FlowerSheet {...props} plant={{ ...plant, entries: [edited] }} />,
  );
  expect(
    screen.getByRole("heading", { name: "Edited song" }),
  ).toBeInTheDocument();
  view.rerender(
    <FlowerSheet
      {...props}
      state={{
        ...state,
        garden_day: "2026-09-19",
        server_now: "2026-09-19T11:00:01Z",
        next_rollover_at: "2026-09-20T11:00:00Z",
      }}
      plant={{ ...plant, entries: [] }}
    />,
  );
  await act(async () => resolve({ entries: [original], error: null }));
  const history = within(
    screen.getByRole("region", { name: "Flower history" }),
  );
  expect(
    history.getByRole("heading", { name: "Edited song" }),
  ).toBeInTheDocument();
  expect(
    history.queryByRole("heading", { name: "Original song" }),
  ).not.toBeInTheDocument();
});

it("retains newer history over older current snapshots within the same millisecond", async () => {
  const state = gardenFixture();
  const plant = {
    ...state.plants[0],
    flower: { ...state.plants[0].flower, type_key: "tulip" as const },
  };
  const original = {
    ...entryFixture(),
    updated_at: "2026-09-18T17:00:00.000100Z",
    payload: {
      title: "Older current song",
      artist: "Artist",
      url: "https://example.com/song",
    },
  };
  const newest = {
    ...original,
    updated_at: "2026-09-18T17:00:00.000300Z",
    payload: { ...original.payload, title: "Newest history song" },
  };
  loadFlowerHistory.mockResolvedValue({ entries: [newest], error: null });
  const props = {
    state,
    item: state.catalog[2],
    now: Date.parse(state.server_now),
    busy: false,
    mutate: vi.fn(),
  };
  const view = render(
    <FlowerSheet {...props} plant={{ ...plant, entries: [original] }} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  await screen.findByRole("heading", { name: "Newest history song" });
  view.rerender(
    <FlowerSheet
      {...props}
      plant={{
        ...plant,
        entries: [{ ...original, updated_at: "2026-09-18T17:00:00.000200Z" }],
      }}
    />,
  );
  expect(
    within(screen.getByRole("region", { name: "Flower history" })).getByRole(
      "heading",
      { name: "Newest history song" },
    ),
  ).toBeInTheDocument();
  view.rerender(<FlowerSheet {...props} plant={{ ...plant, entries: [] }} />);
  expect(
    screen.getByRole("heading", { name: "Newest history song" }),
  ).toBeInTheDocument();
});

vi.mock("@/lib/peony/actions", () => ({
  readPeony: vi.fn(),
  mutatePeony: vi.fn(),
}));
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { gardenFixture, entryFixture } from "@/test/garden-fixture";
import type { Entry } from "@/lib/garden/model";
const { load, read } = vi.hoisted(() => ({ load: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/garden/actions", () => ({ loadFlowerHistory: load }));
vi.mock("@/lib/media/browser", async (original) => ({
  ...(await original<typeof import("@/lib/media/browser")>()),
  mediaRequest: read,
}));
import { FlowerSheet } from "./flower-sheet";
beforeEach(() => {
  vi.clearAllMocks();
  read.mockImplementation(async (_operation, body) => ({
    url: `https://example.test/${body.mediaId}`,
  }));
});
function setup(author: 1 | 2 = 2) {
  const state = gardenFixture();
  const plant = state.plants[0];
  plant.flower.type_key = "sunflower";
  const entry = {
    ...entryFixture(),
    author_id: author,
    payload: { media_id: "old-photo" },
  };
  plant.entries = [entry];
  return {
    state,
    plant,
    item: state.catalog.find((item) => item.type_key === "sunflower")!,
    now: Date.parse(state.server_now),
    busy: false,
    mutate: vi.fn(),
    entry,
  };
}
it.each([1, 2] as const)(
  "reconciles author%s remote replacement and retries the new private reference",
  async (author) => {
    const p = setup(author);
    load.mockResolvedValue({ entries: [p.entry], error: null });
    const { rerender } = render(<FlowerSheet {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Read history" }));
    const history = screen.getByRole("region", { name: "Flower history" });
    await within(history).findByAltText("Shared Sunflower photo");
    const changed = {
      ...p.entry,
      updated_at: "2026-09-18T17:01:00Z",
      payload: { media_id: "new-photo" },
    };
    rerender(<FlowerSheet {...p} plant={{ ...p.plant, entries: [changed] }} />);
    await waitFor(() =>
      expect(screen.getAllByAltText("Shared Sunflower photo")).toHaveLength(2),
    );
    for (const image of screen.getAllByAltText("Shared Sunflower photo"))
      expect(image).toHaveAttribute("src", "https://example.test/new-photo");
    fireEvent.error(within(history).getByAltText("Shared Sunflower photo"));
    fireEvent.click(within(history).getByText("Reload private photo"));
    await within(history).findByAltText("Shared Sunflower photo");
    expect(read.mock.calls.at(-1)?.[1]).toEqual({ mediaId: "new-photo" });
  },
);
it("does not restore an old reference from an in-flight history page", async () => {
  const p = setup();
  let finish!: (value: { entries: Entry[]; error: null }) => void;
  load.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender } = render(<FlowerSheet {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  rerender(
    <FlowerSheet
      {...p}
      plant={{
        ...p.plant,
        entries: [
          {
            ...p.entry,
            updated_at: "2026-09-18T17:01:00Z",
            payload: { media_id: "new-photo" },
          },
        ],
      }}
    />,
  );
  await act(async () => finish({ entries: [p.entry], error: null }));
  await waitFor(() =>
    expect(screen.getAllByAltText("Shared Sunflower photo")).toHaveLength(2),
  );
  for (const image of screen.getAllByAltText("Shared Sunflower photo"))
    expect(image).toHaveAttribute("src", "https://example.test/new-photo");
});
it("invalidates yesterday's history and rejects its in-flight response after rollover", async () => {
  const p = setup();
  let finish!: (value: { entries: Entry[]; error: null }) => void;
  load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender } = render(<FlowerSheet {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  rerender(
    <FlowerSheet
      {...p}
      state={{ ...p.state, garden_day: "2026-09-19" }}
      plant={{ ...p.plant, entries: [] }}
    />,
  );
  await act(async () => finish({ entries: [p.entry], error: null }));
  expect(
    within(
      screen.getByRole("region", { name: "Flower history" }),
    ).queryByAltText("Shared Sunflower photo"),
  ).not.toBeInTheDocument();
  load.mockResolvedValue({
    entries: [
      {
        ...p.entry,
        updated_at: "2026-09-18T17:01:00Z",
        payload: { media_id: "final-photo" },
      },
    ],
    error: null,
  });
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  expect(
    await within(
      screen.getByRole("region", { name: "Flower history" }),
    ).findByAltText("Shared Sunflower photo"),
  ).toHaveAttribute("src", "https://example.test/final-photo");
});
it("drops already loaded history at rollover before fetching the final prior-day reference", async () => {
  const p = setup();
  load.mockResolvedValue({ entries: [p.entry], error: null });
  const { rerender } = render(<FlowerSheet {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  const history = screen.getByRole("region", { name: "Flower history" });
  await within(history).findByAltText("Shared Sunflower photo");
  rerender(
    <FlowerSheet
      {...p}
      state={{ ...p.state, garden_day: "2026-09-19" }}
      plant={{ ...p.plant, entries: [] }}
    />,
  );
  expect(
    within(history).queryByAltText("Shared Sunflower photo"),
  ).not.toBeInTheDocument();
  expect(
    within(history).getByRole("button", { name: "Read history" }),
  ).toBeEnabled();
});
it("keeps a history response newer than the current snapshot", async () => {
  const p = setup();
  load.mockResolvedValue({
    entries: [
      {
        ...p.entry,
        updated_at: "2026-09-18T17:01:00Z",
        payload: { media_id: "newest-photo" },
      },
    ],
    error: null,
  });
  render(<FlowerSheet {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  expect(
    await within(
      screen.getByRole("region", { name: "Flower history" }),
    ).findByAltText("Shared Sunflower photo"),
  ).toHaveAttribute("src", "https://example.test/newest-photo");
});

it("keeps newer history within the same millisecond across timezone offsets", async () => {
  const p = setup();
  p.entry.updated_at = "2026-09-18T10:01:00.000100-07:00";
  load.mockResolvedValue({
    entries: [{ ...p.entry, updated_at: "2026-09-18T17:01:00.000900+00:00", payload: { media_id: "newest-photo" } }],
    error: null,
  });
  render(<FlowerSheet {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "Read history" }));
  expect(await within(screen.getByRole("region", { name: "Flower history" })).findByAltText("Shared Sunflower photo")).toHaveAttribute("src", "https://example.test/newest-photo");
});

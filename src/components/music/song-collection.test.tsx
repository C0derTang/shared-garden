import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { entryFixture } from "@/test/garden-fixture";
const { loadSongs } = vi.hoisted(() => ({ loadSongs: vi.fn() }));
vi.mock("@/lib/music/collection-actions", () => ({ loadSongs }));
import { SongCollection } from "./song-collection";
const song = (id: number, title = "Again") => ({
  ...entryFixture(),
  id,
  author_id: ((id % 2) + 1) as 1 | 2,
  payload: {
    title,
    artist: "Artist",
    url: "https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ",
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  loadSongs.mockResolvedValue({ entries: [], more: false, error: null });
});
it("keeps both members' repeat songs, adds older entries and updates existing titles in place", async () => {
  render(
    <SongCollection
      memberId={1}
      initial={{ entries: [song(22), song(21)], more: true, error: null }}
    />,
  );
  expect(screen.getAllByRole("heading", { name: "Again" })).toHaveLength(2);
  expect(screen.getByText("You")).toBeInTheDocument();
  expect(screen.getByText("Your partner")).toBeInTheDocument();
  loadSongs.mockResolvedValueOnce({
    entries: [song(20)],
    more: false,
    error: null,
  });
  fireEvent.click(screen.getByRole("button", { name: "Older songs" }));
  await waitFor(() =>
    expect(screen.getAllByRole("heading", { name: "Again" })).toHaveLength(3),
  );
  loadSongs.mockResolvedValueOnce({
    entries: [song(22, "Edited"), song(21), song(20)],
    more: false,
    error: null,
  });
  fireEvent.click(screen.getByRole("button", { name: "Refresh saved songs" }));
  await screen.findByRole("heading", { name: "Edited" });
  expect(screen.getAllByRole("heading", { name: "Again" })).toHaveLength(2);
  expect(loadSongs).toHaveBeenLastCalledWith({
    kind: "updates",
    ids: [22, 21, 20],
  });
});
it("keeps older paging cursor stable while newer posts arrive and retains content on failure", async () => {
  render(
    <SongCollection
      memberId={1}
      initial={{ entries: [song(22), song(21)], more: true, error: null }}
    />,
  );
  loadSongs.mockResolvedValueOnce({
    entries: [song(23)],
    more: false,
    error: null,
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Check for newer songs" }),
  );
  await waitFor(() =>
    expect(screen.getAllByRole("heading", { name: "Again" })).toHaveLength(3),
  );
  loadSongs.mockResolvedValueOnce({
    entries: [],
    more: false,
    error: "Unavailable",
  });
  fireEvent.click(screen.getByRole("button", { name: "Older songs" }));
  await screen.findByRole("alert");
  expect(loadSongs).toHaveBeenLastCalledWith({ kind: "older", id: 21 });
  expect(screen.getAllByRole("heading", { name: "Again" })).toHaveLength(3);
});
it("shows an empty collection, retryable initial error and user initiated player controls", async () => {
  const view = render(
    <SongCollection
      memberId={1}
      initial={{ entries: [], more: false, error: "Unavailable" }}
    />,
  );
  expect(screen.queryByText(/No songs yet/)).not.toBeInTheDocument();
  loadSongs.mockResolvedValueOnce({ entries: [], more: false, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText(/No songs yet/);
  view.unmount();
  render(
    <SongCollection
      memberId={1}
      initial={{ entries: [song(1)], more: false, error: null }}
    />,
  );
  expect(document.querySelector("iframe")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Load Spotify player/ }));
  expect(document.querySelector("iframe")).not.toBeNull();
  expect(
    screen.getByRole("link", { name: /Open original song link/ }),
  ).toBeInTheDocument();
});

it("refreshes a long loaded collection in bounded batches and keeps an open player mounted", async () => {
  render(
    <SongCollection
      memberId={1}
      initial={{
        entries: Array.from({ length: 42 }, (_, i) => song(42 - i)),
        more: false,
        error: null,
      }}
    />,
  );
  fireEvent.click(
    screen.getAllByRole("button", { name: /Load Spotify player/ })[0],
  );
  const player = document.querySelector("iframe");
  loadSongs.mockImplementation(async (query: { ids: number[] }) => ({
    entries: query.ids.map((id) => song(id, id === 42 ? "Edited" : "Again")),
    more: false,
    error: null,
  }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh saved songs" }));
  await screen.findByText("Saved songs refreshed.");
  expect(loadSongs.mock.calls.map((call) => call[0].ids.length)).toEqual([
    20, 20, 2,
  ]);
  expect(document.querySelector("iframe")).toBe(player);
  expect(screen.getAllByRole("article")).toHaveLength(42);
});

it("continues through multiple new batches without losing the older browsing cursor", async () => {
  render(
    <SongCollection
      memberId={1}
      initial={{ entries: [song(22), song(21)], more: true, error: null }}
    />,
  );
  loadSongs.mockResolvedValueOnce({
    entries: Array.from({ length: 20 }, (_, i) => song(23 + i)),
    more: true,
    error: null,
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Check for newer songs" }),
  );
  await screen.findByText("New songs added. Check again for more.");
  loadSongs.mockResolvedValueOnce({
    entries: [song(43), song(44)],
    more: false,
    error: null,
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Check for newer songs" }),
  );
  await screen.findByText("New songs added.");
  expect(loadSongs).toHaveBeenLastCalledWith({ kind: "newer", id: 42 });
  expect(screen.getAllByRole("article")).toHaveLength(24);
  fireEvent.click(screen.getByRole("button", { name: "Older songs" }));
  await waitFor(() =>
    expect(loadSongs).toHaveBeenLastCalledWith({ kind: "older", id: 21 }),
  );
});

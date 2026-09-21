import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Mutate } from "@/components/garden/seed-picker";
import { EntryForm } from "@/components/garden/entry-form";
import { gardenFixture, entryFixture } from "@/test/garden-fixture";
const track = {
  id: "1234567890123456789012",
  title: "Synthetic Song",
  artist: "Synthetic Artist",
  album: "Synthetic Album",
  url: "https://open.spotify.com/track/1234567890123456789012",
  image: null,
  selectable: true,
};
let fetcher: ReturnType<typeof vi.fn>;
let mutate: ReturnType<typeof vi.fn<Mutate>>;
function props() {
  const state = gardenFixture();
  return {
    state,
    plant: {
      ...state.plants[0],
      flower: { ...state.plants[0].flower, type_key: "tulip" as const },
    },
    item: state.catalog.find((i) => i.type_key === "tulip")!,
    now: Date.parse(state.server_now),
    busy: false,
    mutate,
    onSaved: vi.fn(),
  };
}
async function search(query = "Synthetic") {
  fireEvent.change(screen.getByRole("searchbox", { name: "Song or artist" }), {
    target: { value: query },
  });
  await userEvent.click(screen.getByRole("button", { name: "Search Spotify" }));
}
beforeEach(() => {
  mutate = vi.fn().mockResolvedValue({ saved: false, error: null });
  fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ tracks: [track], more: false }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
it("searches only on explicit action and selects all song fields without sharing or loading a player", async () => {
  render(<EntryForm {...props()} />);
  await userEvent.type(screen.getByRole("searchbox"), "Synthetic");
  expect(fetcher).not.toHaveBeenCalled();
  await userEvent.keyboard("{Enter}");
  await userEvent.click(
    await screen.findByRole("button", { name: "Choose Synthetic Song" }),
  );
  expect(screen.getByLabelText("Song title")).toHaveValue(track.title);
  expect(screen.getByLabelText("Artist")).toHaveValue(track.artist);
  expect(screen.getByLabelText("Song link")).toHaveValue(track.url);
  expect(screen.getByLabelText("Song title")).toHaveFocus();
  expect(mutate).not.toHaveBeenCalled();
  expect(document.querySelector("iframe")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Share care" }));
  expect(mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "submit",
      payload: { title: track.title, artist: track.artist, url: track.url },
    }),
  );
});
it.each(["unconfigured", "access", "unavailable", "rate_limited"])(
  "preserves manual draft through %s and cancellation",
  async (error) => {
    fetcher.mockResolvedValue(
      Response.json({ error, retryAfter: 60 }, { status: 503 }),
    );
    render(<EntryForm {...props()} />);
    await userEvent.type(screen.getByLabelText("Song title"), "My draft");
    await search();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /enter.*manually/i,
    );
    expect(screen.getByLabelText("Song title")).toHaveValue("My draft");
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel search" }),
    );
    expect(screen.getByLabelText("Song title")).toHaveValue("My draft");
    expect(mutate).not.toHaveBeenCalled();
  },
);
it("ignores earlier responses when a later query completes, and aborts on unmount", async () => {
  let finish!: (value: Response) => void;
  fetcher
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(
      Response.json({ tracks: [{ ...track, title: "New Song" }], more: false }),
    );
  const view = render(<EntryForm {...props()} />);
  await search("Old Song");
  const oldSignal = fetcher.mock.calls[0][1].signal;
  await search("New Song");
  expect(
    await screen.findByRole("button", { name: "Choose New Song" }),
  ).toBeEnabled();
  await act(async () =>
    finish(Response.json({ tracks: [track], more: false })),
  );
  expect(
    screen.queryByRole("button", { name: "Choose Synthetic Song" }),
  ).not.toBeInTheDocument();
  expect(oldSignal.aborted).toBe(true);
  view.unmount();
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
});
it("cancels a pending search without accepting its later response or altering a draft", async () => {
  let finish!: (value: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<EntryForm {...props()} />);
  await userEvent.type(screen.getByLabelText("Song title"), "Draft");
  await search();
  await userEvent.click(screen.getByRole("button", { name: "Cancel search" }));
  await act(async () =>
    finish(Response.json({ tracks: [track], more: false })),
  );
  expect(
    screen.queryByRole("button", { name: "Choose Synthetic Song" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Song title")).toHaveValue("Draft");
});
it("keeps untruncated unavailable metadata and links to Spotify", async () => {
  fetcher.mockResolvedValue(
    Response.json({
      tracks: [{ ...track, title: "A".repeat(201), selectable: false }],
      more: false,
    }),
  );
  render(<EntryForm {...props()} />);
  await search();
  expect(await screen.findByText("A".repeat(201))).toBeVisible();
  expect(screen.getByRole("button", { name: /Cannot choose/ })).toBeDisabled();
  expect(screen.getByRole("link", { name: /A{201}/ })).toHaveAttribute(
    "href",
    track.url,
  );
  expect(screen.getByText(/longer than.*200/i)).toBeVisible();
});
it("handles empty results and offline failure with a usable manual entry", async () => {
  fetcher
    .mockResolvedValueOnce(Response.json({ tracks: [], more: false }))
    .mockRejectedValueOnce(new Error("PRIVATE_DETAIL"));
  render(<EntryForm {...props()} />);
  await search();
  expect(await screen.findByText(/No songs found/)).toBeVisible();
  await search("Different");
  expect(await screen.findByRole("alert")).not.toHaveTextContent(
    "PRIVATE_DETAIL",
  );
  expect(screen.getByLabelText("Song link")).toBeEnabled();
});
it("keeps edit payload and authoritative edit deadline while selecting a replacement", async () => {
  const p = props();
  const editing = {
    ...entryFixture(),
    payload: { title: "Before", artist: "Artist", url: track.url },
  };
  const view = render(<EntryForm {...p} editing={editing} />);
  await search();
  await userEvent.click(
    await screen.findByRole("button", { name: "Choose Synthetic Song" }),
  );
  view.rerender(
    <EntryForm
      {...p}
      editing={editing}
      now={Date.parse(editing.edit_deadline!) + 1}
    />,
  );
  expect(screen.getByRole("button", { name: "Save edit" })).toBeDisabled();
  expect(screen.getByLabelText("Song title")).toHaveValue(track.title);
  expect(mutate).not.toHaveBeenCalled();
});
it("retains the garden-day review gate for an existing draft selected after rollover", async () => {
  const p = props();
  const view = render(<EntryForm {...p} />);
  await userEvent.type(screen.getByLabelText("Song title"), "Draft");
  view.rerender(
    <EntryForm
      {...p}
      state={{
        ...p.state,
        garden_day: "2026-09-19",
        next_rollover_at: "2026-09-20T11:00:00Z",
      }}
    />,
  );
  await search();
  await userEvent.click(
    await screen.findByRole("button", { name: "Choose Synthetic Song" }),
  );
  expect(screen.getByRole("button", { name: "Share care" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Use this draft today" }),
  ).toBeVisible();
});

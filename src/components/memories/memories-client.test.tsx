import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { memoryFixture } from "@/test/memory-fixture";
import type { MemoryItem, MemoryPage } from "@/lib/memories/model";
const { load, media, subscribe } = vi.hoisted(() => ({
  load: vi.fn(),
  media: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock("@/lib/memories/actions", () => ({ loadMemories: load }));
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => ({}) }));
vi.mock("@/lib/garden/realtime", () => ({ subscribeGarden: subscribe }));
vi.mock("@/lib/media/browser", () => ({ mediaRequest: media }));
import { MemoriesClient } from "./memories-client";
const page = (items: MemoryItem[], more = false): MemoryPage => ({
  items,
  more,
  error: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  subscribe.mockReturnValue(() => {});
  load.mockResolvedValue(page([]));
  media.mockResolvedValue({
    url: "https://example.test/private",
    durationMs: 5000,
  });
});

it("opens compact filters from the keyboard and keeps active filters evident and clearable", async () => {
  const user = userEvent.setup();
  render(<MemoriesClient initial={page([memoryFixture()])} memberId={1} />);

  const toggle = screen.getByRole("button", { name: "Filters" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(
    screen.queryByRole("form", { name: "Browse memories" }),
  ).not.toBeInTheDocument();

  await user.tab();
  expect(toggle).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(toggle).toHaveAttribute("aria-expanded", "true");

  fireEvent.change(screen.getByLabelText("Flower type"), {
    target: { value: "daisy" },
  });
  await user.click(screen.getByRole("button", { name: "Apply filters" }));

  await screen.findByText("No memories match those filters.");
  expect(
    screen.getByRole("button", { name: "Filters, 1 active" }),
  ).toHaveAttribute("aria-expanded", "false");
  const active = screen.getByRole("status", { name: "Active filters" });
  expect(within(active).getByText("Daisy")).toBeInTheDocument();
  await user.click(within(active).getByRole("button", { name: "Clear" }));
  await waitFor(() =>
    expect(load.mock.calls.at(-1)?.[0]).toEqual({
      kind: "latest",
      filters: {},
    }),
  );
  expect(screen.getByRole("button", { name: "Filters" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(
    screen.queryByRole("status", { name: "Active filters" }),
  ).not.toBeInTheDocument();
});

it("shows a brief text preview and reveals the complete memory on request", async () => {
  const user = userEvent.setup();
  const longText = `${"A long shared memory with gentle details. ".repeat(8)}The complete ending.`;
  const item = {
    ...memoryFixture(),
    entry: { ...memoryFixture().entry!, payload: { text: longText } },
  };
  render(<MemoriesClient initial={page([item])} memberId={1} />);

  expect(screen.queryByText(longText)).not.toBeInTheDocument();
  const expand = screen.getByRole("button", { name: "Read full memory" });
  expect(expand).toHaveAttribute("aria-expanded", "false");
  await user.click(expand);
  expect(screen.getByText(longText)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Show less" }),
  ).toHaveAttribute("aria-expanded", "true");
});

it("removes loaded voice media when applying a filter", async () => {
  const user = userEvent.setup();
  const voice = {
    ...memoryFixture(),
    flower: { ...memoryFixture().flower, type_key: "bluebell" },
    entry: {
      ...memoryFixture().entry!,
      payload: { media_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    },
  } as MemoryItem;
  render(<MemoriesClient initial={page([voice])} memberId={1} />);

  await user.click(screen.getByRole("button", { name: "Load voice memo" }));
  expect(
    await screen.findByLabelText("Shared Bluebell voice memo"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  fireEvent.change(screen.getByLabelText("Flower type"), {
    target: { value: "rose" },
  });
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  await screen.findByText("No memories match those filters.");
  expect(
    screen.queryByLabelText("Shared Bluebell voice memo"),
  ).not.toBeInTheDocument();
});
it("preserves older cursor and loaded cards while staging more than one page of newer arrivals", async () => {
  const first = memoryFixture("20");
  render(<MemoriesClient initial={page([first], true)} memberId={1} />);
  load.mockResolvedValueOnce(page([memoryFixture("1")], true));
  fireEvent.click(screen.getByRole("button", { name: "Older memories" }));
  await waitFor(() =>
    expect(screen.getAllByText("A quiet walk.")).toHaveLength(2),
  );
  load
    .mockResolvedValueOnce(page([first, memoryFixture("1")]))
    .mockResolvedValueOnce(
      page([memoryFixture("21"), memoryFixture("22")], true),
    );
  fireEvent.click(screen.getByRole("button", { name: "Refresh memories" }));
  await screen.findByRole("button", { name: "Show 2 newer memories" });
  expect(screen.getAllByText("A quiet walk.")).toHaveLength(2);
  load
    .mockResolvedValueOnce(
      page([
        first,
        memoryFixture("1"),
        memoryFixture("21"),
        memoryFixture("22"),
      ]),
    )
    .mockResolvedValueOnce(page([memoryFixture("23")], false));
  fireEvent.click(screen.getByRole("button", { name: "Refresh memories" }));
  await screen.findByRole("button", { name: "Show 3 newer memories" });
  expect(load.mock.calls.at(-1)?.[0]).toMatchObject({
    kind: "newer",
    cursor: { id: "22" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Show 3 newer memories" }),
  );
  expect(screen.getAllByText("A quiet walk.")).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: "Older memories" }));
  await waitFor(() =>
    expect(load.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "older",
      cursor: { id: "1" },
    }),
  );
});
it("rejects an old filter response and keeps real empty/error states distinct", async () => {
  let finish!: (p: MemoryPage) => void;
  load.mockImplementationOnce(
    () =>
      new Promise<MemoryPage>((r) => {
        finish = r;
      }),
  );
  render(
    <MemoriesClient initial={page([memoryFixture()], true)} memberId={1} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Older memories" }));
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  fireEvent.change(screen.getByLabelText("Flower type"), {
    target: { value: "daisy" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  await screen.findByText("No memories match those filters.");
  await act(async () => {
    finish(page([memoryFixture("2")]));
  });
  expect(screen.queryByText("A quiet walk.")).not.toBeInTheDocument();
  load.mockResolvedValue({
    items: [],
    more: false,
    error: "Memories could not load.",
  });
  fireEvent.click(screen.getByRole("button", { name: "Refresh memories" }));
  await screen.findByRole("alert");
});
it("does not sign media or load players until asked, resets a replaced photo, and retries expiry", async () => {
  const photo = {
    ...memoryFixture(),
    flower: { ...memoryFixture().flower, type_key: "sunflower" },
    entry: {
      ...memoryFixture().entry!,
      payload: { media_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    },
  } as MemoryItem;
  render(<MemoriesClient initial={page([photo])} memberId={1} />);
  expect(media).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Load private photo" }));
  const image = await screen.findByRole("img", {
    name: "Shared Sunflower photo",
  });
  fireEvent.error(image);
  fireEvent.click(screen.getByRole("button", { name: "Reload private photo" }));
  await waitFor(() => expect(media).toHaveBeenCalledTimes(2));
  load
    .mockResolvedValueOnce(
      page([
        {
          ...photo,
          read_at: "2026-09-18T18:00:00.000002Z",
          entry: {
            ...photo.entry!,
            payload: { media_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
          },
        },
      ]),
    )
    .mockResolvedValueOnce(page([]));
  fireEvent.click(screen.getByRole("button", { name: "Refresh memories" }));
  await screen.findByRole("button", { name: "Load private photo" });
  expect(
    screen.queryByRole("img", { name: "Shared Sunflower photo" }),
  ).not.toBeInTheDocument();
  expect(media).toHaveBeenCalledTimes(2);
});
it("preserves loaded history on an older-page error", async () => {
  render(
    <MemoriesClient initial={page([memoryFixture()], true)} memberId={2} />,
  );
  load.mockRejectedValue(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Older memories" }));
  await screen.findByRole("alert");
  expect(screen.getByText("A quiet walk.")).toBeInTheDocument();
  expect(screen.getByText("Your partner")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Older memories" })).toBeEnabled();
});

it("replaces a loaded Peony's cleared acceptances while keeping personal originals", async () => {
  const base = memoryFixture();
  const peony = {
    ...base,
    kind: "peony",
    key: `peony:${base.flower.id}`,
    source_id: base.flower.id,
    flower: { ...base.flower, type_key: "peony" },
    entry: null,
    peony: {
      contributions: [
        {
          milestone: 1,
          author_id: 2,
          original_posted_at: base.at,
          garden_day: base.garden_day,
          text: "Our picnic idea",
        },
      ],
      plan: {
        version: "1",
        activity: "Picnic",
        starts_at: "2026-09-20T18:00:00Z",
        updated_at: base.at,
        updated_by: 1,
        acceptances: [
          {
            author_id: 2,
            original_posted_at: base.at,
            garden_day: base.garden_day,
          },
        ],
      },
      completed: [],
    },
  } as MemoryItem;
  render(<MemoriesClient initial={page([peony])} memberId={1} />);
  expect(screen.queryByText(/accepted/)).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Open date history, 0 of 4 complete" }),
  );
  expect(screen.getByText(/accepted/)).toBeVisible();
  const updated = {
    ...peony,
    read_at: "2026-09-18T18:00:00.000002Z",
    peony: {
      ...peony.peony!,
      plan: {
        ...peony.peony!.plan!,
        version: "2",
        activity: "Walk",
        acceptances: [],
      },
    },
  };
  load.mockResolvedValueOnce(page([updated])).mockResolvedValueOnce(page([]));
  fireEvent.click(screen.getByRole("button", { name: "Refresh memories" }));
  await screen.findByText("No current acceptances yet.");
  expect(screen.queryByText(/accepted/)).not.toBeInTheDocument();
  expect(screen.getByText("Our picnic idea")).toBeInTheDocument();
  expect(screen.getByText("Walk")).toBeInTheDocument();
});

it("refreshes staged bundles before adoption and ignores older snapshot responses", async () => {
  const old = memoryFixture("3");
  render(<MemoriesClient initial={page([memoryFixture("1")])} memberId={1} />);
  load
    .mockResolvedValueOnce(page([memoryFixture("1")]))
    .mockResolvedValueOnce(page([old]));
  fireEvent.click(screen.getByRole("button", { name: "Refresh memories" }));
  await screen.findByRole("button", { name: "Show 1 newer memory" });
  const replacement = {
    ...old,
    read_at: "2026-09-18T18:00:00.000002Z",
    entry: { ...old.entry!, payload: { text: "Latest staged value" } },
  };
  load
    .mockResolvedValueOnce(page([memoryFixture("1"), replacement]))
    .mockResolvedValueOnce(page([]));
  fireEvent.click(screen.getByRole("button", { name: "Refresh memories" }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(4));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Show 1 newer memory" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Show 1 newer memory" }));
  expect(screen.getByText("Latest staged value")).toBeInTheDocument();
  load.mockResolvedValueOnce(page([old])).mockResolvedValueOnce(page([]));
  fireEvent.click(screen.getByRole("button", { name: "Refresh memories" }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(6));
  expect(screen.getByText("Latest staged value")).toBeInTheDocument();
});

it("renders every retained content kind safely with original dates and lazy players", () => {
  const rows = [
    "rose",
    "cactus",
    "tulip",
    "marigold",
    "daisy",
    "hydrangea",
    "sunflower",
    "snapdragon",
    "moonflower",
    "bluebell",
    "dandelion",
    "forget-me-not",
  ].map((type, i) => {
    const base = memoryFixture(String(i + 1));
    return {
      ...base,
      flower: {
        ...base.flower,
        type_key: type,
        first_bloom_at: base.at,
        first_bloom_day: base.garden_day,
      },
      entry: {
        ...base.entry!,
        author_id: i % 2 ? 2 : 1,
        question: type === "daisy" ? "The original historical question?" : null,
        payload:
          type === "tulip"
            ? {
                title: "Repeat song",
                artist: "Synthetic artist",
                url: "https://open.spotify.com/track/1234567890123456789012",
              }
            : type === "hydrangea"
              ? { mood: "calm" }
              : ["sunflower", "bluebell"].includes(type)
                ? { media_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }
                : type === "cactus"
                  ? {}
                  : { text: "<script>text stays text</script>" },
      },
    } as MemoryItem;
  });
  render(<MemoriesClient initial={page(rows)} memberId={1} />);
  expect(
    screen.getByText("The original historical question?"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Checked in with our permanent Cactus."),
  ).toBeInTheDocument();
  expect(screen.getByText("Calm · Blue")).toBeInTheDocument();
  expect(screen.getAllByText(/Permanent bloom/)).toHaveLength(12);
  expect(screen.getAllByText("Your partner")).toHaveLength(6);
  expect(
    screen.getByRole("button", { name: "Load voice memo" }),
  ).toBeInTheDocument();
  expect(document.querySelector("script,iframe,audio,img")).toBeNull();
  expect(media).not.toHaveBeenCalled();
});

it("collects forty-five arrivals in bounded pages without skipping lookahead or changing the older cursor", async () => {
  const first = memoryFixture("100");
  const incoming = Array.from({ length: 45 }, (_, n) =>
    memoryFixture(String(101 + n)),
  );
  const allRows = [first, ...incoming];
  load.mockImplementation(async (q) =>
    q.kind === "updates"
      ? page(allRows.filter((i) => q.keys.includes(i.key)))
      : q.kind === "newer"
        ? page(
            incoming.filter((i) => i.source_id > q.cursor.id).slice(0, 20),
            incoming.filter((i) => i.source_id > q.cursor.id).length > 20,
          )
        : page([]),
  );
  render(<MemoriesClient initial={page([first], true)} memberId={1} />);
  for (const count of [20, 40, 45]) {
    fireEvent.click(screen.getByRole("button", { name: "Refresh memories" }));
    await screen.findByRole("button", { name: `Show ${count} newer memories` });
  }
  expect(
    load.mock.calls
      .filter(([q]) => q.kind === "newer")
      .map(([q]) => q.cursor.id),
  ).toEqual(["100", "120", "140"]);
  expect(
    load.mock.calls
      .filter(([q]) => q.kind === "updates")
      .every(([q]) => q.keys.length <= 20),
  ).toBe(true);
  expect(screen.getAllByText("A quiet walk.")).toHaveLength(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Show 45 newer memories" }),
  );
  expect(screen.getAllByText("A quiet walk.")).toHaveLength(46);
  fireEvent.click(screen.getByRole("button", { name: "Older memories" }));
  await waitFor(() =>
    expect(load.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "older",
      cursor: { id: "100" },
    }),
  );
});

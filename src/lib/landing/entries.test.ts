// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { config, verify, rpc, createClient, cookieStore } = vi.hoisted(() => ({
  config: vi.fn(),
  verify: vi.fn(),
  rpc: vi.fn(),
  createClient: vi.fn(),
  cookieStore: vi.fn(),
}));
vi.mock("@/lib/auth/config", () => ({ getAuthConfig: config }));
vi.mock("@/lib/auth/member", () => ({ verifyMember: verify }));
vi.mock("@supabase/ssr", () => ({ createServerClient: createClient }));
vi.mock("next/headers", () => ({ cookies: cookieStore }));
import { loadLandingData, truncateText } from "./entries";
import type { LandingFlower } from "./types";

const authConfig = {
  appOrigin: "https://app.example.test",
  supabaseUrl: "https://backend.example.test",
  supabasePublishableKey: "sb_publishable_synthetic",
};
const flowerIds: Record<string, string> = {
  rose: "00000000-0000-4000-8000-000000000001",
  tulip: "00000000-0000-4000-8000-000000000002",
  marigold: "00000000-0000-4000-8000-000000000003",
  daisy: "00000000-0000-4000-8000-000000000004",
  dandelion: "00000000-0000-4000-8000-000000000005",
  peony: "00000000-0000-4000-8000-000000000006",
};
const flower = (type: string) => ({
  id: flowerIds[type],
  type_key: type,
  spot: 2,
  planted_at: "2026-08-01T17:00:00Z",
  planted_day: "2026-08-01",
  planted_by: 1,
  first_bloom_at: null,
  first_bloom_day: null,
  shared_wish: type === "dandelion" ? "Synthetic wish" : null,
  fulfilled_at: null,
  fulfilled_by: null,
});
/** A raw `memories_page` entry item; `n` orders it (larger is newer). */
const entry = (
  type: string,
  n: number,
  payload: Record<string, string>,
  author: 1 | 2 = 1,
) => {
  const at = `2026-09-${String(n).padStart(2, "0")}T17:00:00Z`;
  return {
    key: `entry:${n}`,
    kind: "entry",
    source_id: String(n),
    at,
    garden_day: at.slice(0, 10),
    read_at: "2026-10-01T00:00:00Z",
    flower: flower(type),
    entry: {
      author_id: author,
      updated_at: at,
      payload,
      question: type === "daisy" ? "Synthetic question?" : null,
    },
    peony: null,
  };
};
const wish = {
  key: `wish:${flowerIds.dandelion}`,
  kind: "wish",
  source_id: flowerIds.dandelion,
  at: "2026-09-29T17:00:00Z",
  garden_day: "2026-09-29",
  read_at: "2026-10-01T00:00:00Z",
  flower: flower("dandelion"),
  entry: null,
  peony: null,
};
const peony = {
  key: `peony:${flowerIds.peony}`,
  kind: "peony",
  source_id: flowerIds.peony,
  at: "2026-09-28T17:00:00Z",
  garden_day: "2026-09-28",
  read_at: "2026-10-01T00:00:00Z",
  flower: flower("peony"),
  entry: null,
  peony: { contributions: [], plan: null, completed: [] },
};
const page = (items: unknown[]) => ({
  data: { items, more: false },
  error: null,
});
let pages: Record<LandingFlower, unknown>;
const pTypes = () => rpc.mock.calls.map(([, args]) => args.p_type);

beforeEach(() => {
  vi.clearAllMocks();
  config.mockReturnValue(authConfig);
  cookieStore.mockResolvedValue({ getAll: () => [] });
  createClient.mockReturnValue({ rpc });
  verify.mockResolvedValue({
    status: "allowed",
    member: { member_id: 1, member_role: "owner" },
  });
  pages = {
    marigold: page([entry("marigold", 3, { text: "  Watered at dawn.  " })]),
    tulip: page([
      entry("tulip", 2, { title: "Synthetic Song", artist: "The Testers", url: "https://music.example.test/a" }, 2),
    ]),
    rose: page([entry("rose", 1, { text: "A quiet walk." })]),
  };
  rpc.mockImplementation(async (_name: string, args: { p_type: LandingFlower }) =>
    pages[args.p_type],
  );
  vi.stubEnv("GARDEN_MEMBER_1_NAME", "Avery");
  vi.stubEnv("GARDEN_MEMBER_2_NAME", "Blake");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("returns the login-only visitor state when auth is not configured", async () => {
  config.mockReturnValue(null);
  expect(await loadLandingData()).toEqual({ status: "visitor" });
  expect(cookieStore).not.toHaveBeenCalled();
  expect(createClient).not.toHaveBeenCalled();
  expect(verify).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

it.each(["signin", "denied", "unavailable"])(
  "never loads private entries for a %s session",
  async (status) => {
    verify.mockResolvedValue({ status });
    expect(await loadLandingData()).toEqual({ status: "visitor" });
    expect(rpc).not.toHaveBeenCalled();
  },
);

it("treats thrown verification or client setup failures as a visitor", async () => {
  verify.mockRejectedValue(new Error("PRIVATE_BACKEND_DETAIL"));
  expect(await loadLandingData()).toEqual({ status: "visitor" });
  createClient.mockImplementation(() => {
    throw new Error("bad client");
  });
  expect(await loadLandingData()).toEqual({ status: "visitor" });
  cookieStore.mockRejectedValue(new Error("no request"));
  expect(await loadLandingData()).toEqual({ status: "visitor" });
  expect(rpc).not.toHaveBeenCalled();
});

it("reads the session with the shared auth cookie and never writes cookies", async () => {
  await loadLandingData();
  const [url, key, options] = createClient.mock.calls[0];
  expect(url).toBe(authConfig.supabaseUrl);
  expect(key).toBe(authConfig.supabasePublishableKey);
  expect(options.cookieOptions).toMatchObject({ name: "sg-auth", path: "/", secure: true });
  expect(() => options.cookies.setAll([{ name: "sg-auth", value: "x", options: {} }])).not.toThrow();
  expect(verify).toHaveBeenCalledWith({ rpc });
});

it("forces the server client's network reads to bypass shared caches", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  await loadLandingData();
  const options = createClient.mock.calls[0][2];
  await options.global.fetch("https://backend.example.test/data", { cache: "force-cache" });
  expect(network).toHaveBeenCalledWith("https://backend.example.test/data", { cache: "no-store" });
});

it("waits for verification before requesting any private memory data", async () => {
  let authorize!: (result: unknown) => void;
  verify.mockReturnValue(new Promise((resolve) => { authorize = resolve; }));
  const result = loadLandingData();
  await vi.waitFor(() => expect(verify).toHaveBeenCalledOnce());
  expect(rpc).not.toHaveBeenCalled();
  authorize({ status: "allowed", member: { member_id: 1, member_role: "owner" } });
  expect(await result).toMatchObject({ status: "member" });
  expect(rpc).toHaveBeenCalledTimes(3);
});

it("loads each flower through the bounded memories RPC for a verified member", async () => {
  const data = await loadLandingData();
  expect(rpc).toHaveBeenCalledTimes(3);
  expect(pTypes().sort()).toEqual(["marigold", "rose", "tulip"]);
  for (const type of ["marigold", "tulip", "rose"])
    expect(rpc).toHaveBeenCalledWith("memories_page", {
      p_mode: "latest",
      p_cursor: null,
      p_keys: null,
      p_type: type,
      p_spot: null,
      p_from: null,
      p_to: null,
      p_author: null,
    });
  expect(data).toEqual({
    status: "member",
    entries: {
      marigold: [{ id: "3", flower: "marigold", text: "Watered at dawn.", author: "Avery", day: "2026-09-03" }],
      tulip: [{ id: "2", flower: "tulip", text: "Synthetic Song — The Testers", author: "Blake", day: "2026-09-02" }],
      rose: [{ id: "1", flower: "rose", text: "A quiet walk.", author: "Avery", day: "2026-09-01" }],
    },
  });
});

it("formats tulips as title and artist, falling back to the title alone", async () => {
  pages.tulip = page([
    entry("tulip", 5, { title: "  Only Title ", artist: "   ", url: "https://music.example.test/b" }),
    entry("tulip", 4, { title: " ", artist: "Nameless", url: "https://music.example.test/c" }),
    entry("tulip", 3, { title: "Song", artist: " Band ", url: "https://music.example.test/d" }),
  ]);
  const data = await loadLandingData();
  if (data.status !== "member") throw new Error("expected member");
  expect(data.entries.tulip.map((e) => e.text)).toEqual(["Only Title", "Song — Band"]);
});

it("skips empty text and keeps the twelve newest entries per flower", async () => {
  pages.rose = page([
    entry("rose", 20, { text: "   " }),
    ...Array.from({ length: 15 }, (_, i) => entry("rose", i + 1, { text: `Rose ${i + 1}` })),
  ]);
  const data = await loadLandingData();
  if (data.status !== "member") throw new Error("expected member");
  expect(data.entries.rose.map((e) => e.id)).toEqual(
    ["15", "14", "13", "12", "11", "10", "9", "8", "7", "6", "5", "4"],
  );
});

it("truncates long text at a word boundary with an ellipsis", async () => {
  const long = `${"word ".repeat(60)}end`;
  pages.marigold = page([entry("marigold", 1, { text: long })]);
  const data = await loadLandingData();
  if (data.status !== "member") throw new Error("expected member");
  const [{ text }] = data.entries.marigold;
  expect(Array.from(text).length).toBeLessThanOrEqual(220);
  expect(text.endsWith("word…")).toBe(true);
  expect(text.slice(0, -1).trim().split(" ").every((w) => w === "word")).toBe(true);
});

it("truncation keeps short text, counts code points, and hard-cuts one long word", () => {
  expect(truncateText("short")).toBe("short");
  const exact = "a".repeat(220);
  expect(truncateText(exact)).toBe(exact);
  const unspaced = "🌹".repeat(300);
  const cut = truncateText(unspaced);
  expect(Array.from(cut)).toHaveLength(220);
  expect(cut).toBe(`${"🌹".repeat(219)}…`);
  expect(truncateText(`tiny ${"x".repeat(300)}`)).toBe(`tiny ${"x".repeat(214)}…`);
});

it("gives a failing flower an empty list without failing the others", async () => {
  const error = vi.spyOn(console, "error");
  const log = vi.spyOn(console, "log");
  const warn = vi.spyOn(console, "warn");
  rpc.mockImplementation(async (_name: string, args: { p_type: LandingFlower }) => {
    if (args.p_type === "tulip") return { data: null, error: { message: "PRIVATE" } };
    if (args.p_type === "rose") throw new Error("PRIVATE_BACKEND_DETAIL");
    return pages[args.p_type];
  });
  const data = await loadLandingData();
  expect(data).toMatchObject({
    status: "member",
    entries: { tulip: [], rose: [] },
    unavailable: ["rose", "tulip"],
  });
  if (data.status !== "member") throw new Error("expected member");
  expect(data.entries.marigold.map((e) => e.text)).toEqual(["Watered at dawn."]);
  expect(error).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
});

it("treats an invalid page as an empty flower and stays a member with no entries", async () => {
  rpc.mockResolvedValue({ data: { items: [{ kind: "entry" }], more: false }, error: null });
  expect(await loadLandingData()).toEqual({
    status: "member",
    entries: { marigold: [], tulip: [], rose: [] },
    unavailable: ["rose", "marigold", "tulip"],
  });
});

it("ignores wishes, Peony bundles, and entries from other flowers", async () => {
  pages.marigold = page([
    wish,
    peony,
    entry("daisy", 9, { text: "Not a marigold" }),
    entry("marigold", 8, { text: "Kept" }),
  ]);
  const data = await loadLandingData();
  if (data.status !== "member") throw new Error("expected member");
  expect(data.entries.marigold).toEqual([
    { id: "8", flower: "marigold", text: "Kept", author: "Avery", day: "2026-09-08" },
  ]);
});

it("uses null authors when display names are not configured", async () => {
  vi.stubEnv("GARDEN_MEMBER_1_NAME", "");
  vi.stubEnv("GARDEN_MEMBER_2_NAME", "<script>");
  const data = await loadLandingData();
  if (data.status !== "member") throw new Error("expected member");
  expect(data.entries.rose[0].author).toBeNull();
  expect(data.entries.tulip[0].author).toBeNull();
});

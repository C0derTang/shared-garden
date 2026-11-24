import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldRendererCallbacks, WorldSceneState } from "@/components/world/renderer";
import { V2_ACHIEVEMENT_COUNT, type AchievementStateV2 } from "@/lib/garden-v2/achievements";
import type { GardenState } from "@/lib/garden-v2/model";
import { guideKey, type GardenView } from "@/lib/garden-v2/views";
import type { MemoryItem } from "@/lib/memories/model";
import { v2GardenFixture } from "@/test/garden-v2-fixture";
import { memoryFixture } from "@/test/memory-fixture";

const worlds: { callbacks: WorldRendererCallbacks; states: WorldSceneState[] }[] = [];
vi.mock("@/components/world/renderer", () => ({
  createWorldRenderer: (_canvas: HTMLCanvasElement, state: WorldSceneState, callbacks: WorldRendererCallbacks) => {
    const record = { callbacks, states: [state] };
    worlds.push(record);
    return { update: (next: WorldSceneState) => record.states.push(next), travel: vi.fn(), pan: vi.fn(), dispose: vi.fn() };
  },
}));
vi.mock("@/components/world/flowers/studio-renderer", () => ({ createStudioRenderer: () => ({ update: vi.fn(), dispose: vi.fn() }) }));
vi.mock("@/components/world/flowers/flower-layer", () => ({ createFlowerLayer: () => ({ draw: vi.fn(), setFlowers: vi.fn() }) }));
const api = vi.hoisted(() => ({
  refreshGardenV2: vi.fn(),
  mutateGardenV2: vi.fn(),
  loadFlowerHistoryV2: vi.fn(),
  readRepliesV2: vi.fn(),
  saveReplyV2: vi.fn(),
  readAchievementsV2: vi.fn(),
  loadMemoriesV2: vi.fn(),
  readPrivateInteraction: vi.fn(),
  controlPrivateInteraction: vi.fn(),
  previewPrivateInteraction: vi.fn(),
  answerPrivateInteraction: vi.fn(),
  readSettings: vi.fn(),
  saveSetting: vi.fn(),
  mediaRequest: vi.fn(),
}));
vi.mock("@/lib/garden-v2/actions", () => ({
  refreshGardenV2: api.refreshGardenV2,
  mutateGardenV2: api.mutateGardenV2,
  loadFlowerHistoryV2: api.loadFlowerHistoryV2,
  readRepliesV2: api.readRepliesV2,
  saveReplyV2: api.saveReplyV2,
}));
vi.mock("@/lib/garden-v2/achievement-actions", () => ({ readAchievementsV2: api.readAchievementsV2 }));
vi.mock("@/lib/garden-v2/memory-actions", () => ({ loadMemoriesV2: api.loadMemoriesV2 }));
vi.mock("@/lib/private-interaction/actions", () => ({
  readPrivateInteraction: api.readPrivateInteraction,
  controlPrivateInteraction: api.controlPrivateInteraction,
  previewPrivateInteraction: api.previewPrivateInteraction,
  answerPrivateInteraction: api.answerPrivateInteraction,
}));
vi.mock("@/lib/settings/actions", () => ({ readSettings: api.readSettings, saveSetting: api.saveSetting }));
// The legacy feeds must never be read by the new garden.
const legacy = vi.hoisted(() => ({ loadMemories: vi.fn(), readReplies: vi.fn(), saveReply: vi.fn() }));
vi.mock("@/lib/memories/actions", () => ({ loadMemories: legacy.loadMemories }));
vi.mock("@/lib/replies/actions", () => ({ readReplies: legacy.readReplies, saveReply: legacy.saveReply }));
vi.mock("@/lib/media/browser", async (original) => ({ ...(await original<object>()), mediaRequest: api.mediaRequest }));
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { GardenV2 } = await import("../garden-v2");
const { MemberPreferences } = await import("@/components/settings/member-preferences");
const { MemberNamesProvider } = await import("@/components/auth/member-names");
const { SheetScope } = await import("@/components/ui/sheet-scope");

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const settings = { revision: 1, guide: "finished" as const, gentle_motion: true };

function achievements(): AchievementStateV2 {
  return {
    server_now: "2026-11-24T20:00:00Z",
    garden_day: "2026-11-24",
    current_streak: 2,
    achievements: Array.from({ length: V2_ACHIEVEMENT_COUNT }, (_, i) => ({
      achievement_id: i === 0 ? "first-seed" : `a-${i + 1}`,
      position: i + 1,
      title: i === 0 ? "First seed planted" : `Achievement ${i + 1}`,
      target: 3,
      unit: "days",
      requirement: "A synthetic requirement.",
      progress: i === 0 ? 3 : 1,
      earned_at: i === 0 ? "2026-11-24T20:00:00Z" : null,
      earned_day: i === 0 ? "2026-11-24" : null,
    })),
  };
}

function memory(id: string, patch: Partial<MemoryItem> = {}, flower: Partial<MemoryItem["flower"]> = {}): MemoryItem {
  const item = memoryFixture(id);
  return { ...item, ...patch, flower: { ...item.flower, ...flower } };
}

let state: GardenState;

beforeEach(() => {
  worlds.length = 0;
  window.localStorage.clear();
  window.history.replaceState(null, "", "/garden");
  for (const fn of Object.values(api)) fn.mockReset();
  for (const fn of Object.values(legacy)) fn.mockReset();
  state = v2GardenFixture();
  api.refreshGardenV2.mockImplementation(async () => ({ state, error: null }));
  api.loadFlowerHistoryV2.mockResolvedValue({ entries: [], error: null });
  api.readRepliesV2.mockResolvedValue({ replies: [], error: null });
  api.readAchievementsV2.mockResolvedValue({ state: achievements(), error: null });
  api.loadMemoriesV2.mockResolvedValue({ items: [], more: false, error: null });
  api.readPrivateInteraction.mockResolvedValue({ state: { status: "unavailable" }, error: null });
  api.readSettings.mockResolvedValue({ state: settings, error: null });
  vi.stubGlobal("navigator", { ...navigator, gpu: {}, onLine: true });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mount({ view = null, flower = null, seen = true, ready = true }: { view?: GardenView | null; flower?: string | null; seen?: boolean; ready?: boolean } = {}) {
  if (seen) window.localStorage.setItem(guideKey(1), "1");
  // As on the page: the sheet scope queues the private moment behind flower views.
  const result = render(
    <MemberNamesProvider partnerName="Rowan">
      <MemberPreferences initial={{ state: settings, error: null }}>
        <SheetScope>
          <GardenV2 initial={{ state, error: null }} initialFlowerId={flower} initialView={view} />
        </SheetScope>
      </MemberPreferences>
    </MemberNamesProvider>,
  );
  await flush();
  await flush();
  if (ready) act(() => worlds[0]!.callbacks.onReady());
  await flush();
  return result;
}

const pendingMoment = {
  state: { status: "pending", content: { title: "A synthetic moment", message: "Placeholder.", choices: [{ key: "a", label: "One" }, { key: "b", label: "Two" }] } },
  error: null,
};

describe("the garden's overlays", () => {
  it("floats a handwritten menu whose words are real deep links", async () => {
    await mount();
    const nav = screen.getByRole("navigation", { name: "Garden keepsakes" });
    expect(within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["memories", "/garden?view=memories"],
      ["achievements", "/garden?view=achievements"],
      ["songs", "/garden?view=songs"],
      ["settings", "/garden?view=settings"],
    ]);
  });

  it("opens an overlay as a modal dialog over a paused world, and Escape returns focus to its word", async () => {
    const user = userEvent.setup();
    await mount();
    const word = screen.getByRole("link", { name: "achievements" });
    word.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "achievements" });
    expect(window.location.search).toBe("?view=achievements");
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "achievements" }));
    expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: true });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toBe("");
    expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: false });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "achievements" }));
  });

  it("shows the new garden's medals with the day each was earned, and how each grows", async () => {
    const user = userEvent.setup();
    await mount({ view: "achievements" });
    const dialog = await screen.findByRole("dialog", { name: "achievements" });
    await within(dialog).findByText("1 of 25 earned");
    expect(api.readAchievementsV2).toHaveBeenCalled();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(25);
    const medal = within(dialog).getByRole("button", { name: "First seed planted, earned, 3 of 3 days" });
    expect(medal).toHaveTextContent("earned Nov 24");
    await user.click(medal);
    expect(medal).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByText("A synthetic requirement.", { selector: "p" })).toBeInTheDocument();
    expect(within(dialog).getByText(/earned on garden day Nov 24/)).toBeInTheDocument();
  });

  it("reads Memories from the new garden only, filters by person, and loads photos only when asked", async () => {
    const user = userEvent.setup();
    const photo = memory("2", { entry: { author_id: 2, updated_at: "2026-11-24T18:00:00Z", payload: { media_id: "11111111-1111-4111-8111-111111111111" }, question: null } }, { type_key: "sunflower" });
    api.loadMemoriesV2.mockResolvedValue({ items: [memory("1"), photo], more: false, error: null });
    api.mediaRequest.mockResolvedValue({ url: "https://storage.example.test/signed" });
    await mount({ view: "memories" });
    const dialog = await screen.findByRole("dialog", { name: "memories" });
    expect(await within(dialog).findByRole("article", { name: "rose" })).toHaveTextContent("A quiet walk.");
    expect(api.loadMemoriesV2).toHaveBeenCalledWith({ kind: "latest", filters: {} });
    expect(legacy.loadMemories).not.toHaveBeenCalled();
    // Photos stay private until asked (decision 0018), then read through the new garden's media.
    expect(within(dialog).getByRole("img", { name: /photo, not loaded/ })).toBeInTheDocument();
    expect(api.mediaRequest).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "load private photo" }));
    expect(await within(dialog).findByRole("img", { name: "Shared Sunflower photo" })).toHaveAttribute("src", "https://storage.example.test/signed");
    expect(api.mediaRequest).toHaveBeenCalledWith("read", { mediaId: "11111111-1111-4111-8111-111111111111", garden: "v2" }, expect.any(AbortSignal));

    await user.click(within(dialog).getByRole("button", { name: "Rowan" }));
    await waitFor(() => expect(api.loadMemoriesV2).toHaveBeenLastCalledWith({ kind: "latest", filters: { author: 2 } }));
    expect(within(dialog).getByRole("button", { name: "Rowan" })).toHaveAttribute("aria-pressed", "true");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Flower" }), "tulip");
    await waitFor(() => expect(api.loadMemoriesV2).toHaveBeenLastCalledWith({ kind: "latest", filters: { author: 2, type: "tulip" } }));
  });

  it("leaves Memories for a flower in the world", async () => {
    const user = userEvent.setup();
    const rose = state.plants[0]!;
    api.loadMemoriesV2.mockResolvedValue({ items: [memory("1", {}, { id: rose.flower.id })], more: false, error: null });
    await mount({ view: "memories" });
    const dialog = await screen.findByRole("dialog", { name: "memories" });
    await user.click(await within(dialog).findByRole("link", { name: "Visit the rose in the garden" }));
    expect(await screen.findByRole("dialog", { name: "rose" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "memories" })).toBeNull();
    expect(window.location.search).toBe(`?flower=${rose.flower.id}`);
  });

  it("collects our songs from new-garden tulips with safe links", async () => {
    const song = memory("3", { entry: { author_id: 1, updated_at: "2026-11-24T18:00:00Z", payload: { title: "Synthetic Song", artist: "Example Band", url: "https://music.example.test/song" }, question: null } }, { type_key: "tulip" });
    const unsafe = memory("4", { entry: { author_id: 2, updated_at: "2026-11-24T18:00:00Z", payload: { title: "Odd", artist: "Link", url: "javascript:alert(1)" }, question: null } }, { type_key: "tulip" });
    api.loadMemoriesV2.mockResolvedValue({ items: [song, unsafe], more: false, error: null });
    await mount({ view: "songs" });
    const dialog = await screen.findByRole("dialog", { name: "our songs" });
    await within(dialog).findByText("Synthetic Song");
    expect(api.loadMemoriesV2).toHaveBeenCalledWith({ kind: "latest", filters: { type: "tulip" } });
    expect(within(dialog).getByRole("link", { name: /Open original song link/ })).toHaveAttribute("href", "https://music.example.test/song");
    expect(within(dialog).getByText("The saved song link is unavailable.")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("link", { name: /Open original song link/ })).toHaveLength(1);
  });

  it("keeps shared settings, the owner's private controls and a way to the old garden", async () => {
    const user = userEvent.setup();
    api.readPrivateInteraction.mockResolvedValue({ state: { status: "owner", detail: { status: "ready", armed: true, unread: false, answer: null } }, error: null });
    api.saveSetting.mockResolvedValue({ state: { ...settings, revision: 2, gentle_motion: false }, error: null });
    await mount({ view: "settings" });
    const dialog = await screen.findByRole("dialog", { name: "settings" });
    expect(within(dialog).getByRole("link", { name: "visit the old garden" })).toHaveAttribute("href", "/legacy");
    expect(await within(dialog).findByRole("status", { name: "Delivery status" })).toHaveTextContent("Armed · Waiting for all 26 achievements.");
    expect(within(dialog).getByRole("button", { name: "Disarm delivery" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: "Allow gentle motion" }));
    expect(api.saveSetting).toHaveBeenCalledWith({ gentle_motion: false });
    expect(within(dialog).getByRole("button", { name: "sign out" }).closest("form")).toHaveAttribute("action", "/auth/sign-out");
  });

  it("delivers a pending private moment in the new garden too, and closing it lands on a visible control", async () => {
    const user = userEvent.setup();
    api.readPrivateInteraction.mockResolvedValue(pendingMoment);
    await mount();
    expect(await screen.findByRole("dialog", { name: "A synthetic moment" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    const reopen = screen.getByRole("button", { name: "Open your garden moment" });
    await waitFor(() => expect(document.activeElement).toBe(reopen));
    expect(reopen.closest("[aria-hidden]")).toBeNull();
  });

  it("queues a moment that arrives while a flower's view is open, keeping the draft and focus", async () => {
    const user = userEvent.setup();
    const rose = state.plants[0]!;
    rose.member1_submitted = false;
    rose.entries = [];
    await mount({ flower: rose.flower.id });
    const split = await screen.findByRole("dialog", { name: "rose" });
    const note = within(split).getAllByRole("textbox")[0]!;
    await user.click(note);
    await user.type(note, "an unsaved synthetic draft");
    // The moment becomes pending and the next refresh (focus) delivers it.
    api.readPrivateInteraction.mockResolvedValue(pendingMoment);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await flush();
    expect(api.readPrivateInteraction).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog", { name: "A synthetic moment" })).toBeNull();
    expect(document.activeElement).toBe(note);
    expect(note).toHaveValue("an unsaved synthetic draft");
    // Closing the flower's view releases the scope: the moment opens now.
    await user.keyboard("{Escape}");
    const moment = await screen.findByRole("dialog", { name: "A synthetic moment" });
    expect(moment.contains(document.activeElement)).toBe(true);
    expect(screen.queryByRole("dialog", { name: "rose" })).toBeNull();
  });

  it("greets a first visit with a short guide, once, and Settings can replay it", async () => {
    const user = userEvent.setup();
    await mount({ seen: false });
    const guide = await screen.findByRole("dialog", { name: "a little guide" });
    expect(window.location.search).toBe("?view=guide");
    expect(within(guide).getByRole("heading", { name: /welcome to our new garden/ })).toBeInTheDocument();
    await user.click(within(guide).getByRole("button", { name: "next" }));
    expect(within(guide).getByRole("heading", { name: "wander, page 2 of 4" })).toBeInTheDocument();
    await user.click(within(guide).getByRole("button", { name: "back" }));
    await user.click(within(guide).getByRole("button", { name: "skip" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.localStorage.getItem(guideKey(1))).toBe("1");
    expect(document.activeElement).toHaveAttribute("data-garden-world");

    await user.click(screen.getByRole("link", { name: "settings" }));
    await user.click(await screen.findByRole("button", { name: "replay the guide" }));
    const replay = await screen.findByRole("dialog", { name: "a little guide" });
    for (let page = 0; page < 3; page++) await user.click(within(replay).getByRole("button", { name: "next" }));
    // Behind the modal guide the menu is hidden from assistive tech, but it glows.
    expect(document.querySelector(`nav[aria-label="Garden keepsakes"]`)).toHaveAttribute("data-glow");
    await user.click(within(replay).getByRole("button", { name: "let’s wander" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "settings" }));
  });

  it("does not greet a returning visitor or a link to a flower", async () => {
    const first = await mount();
    expect(screen.queryByRole("dialog")).toBeNull();
    first.unmount();
    worlds.length = 0;
    window.localStorage.clear();
    await mount({ seen: false, flower: state.plants[0]!.flower.id });
    expect(screen.queryByRole("dialog", { name: "a little guide" })).toBeNull();
  });

  it("does not greet after a deep-linked overlay closes before the world is painted", async () => {
    const user = userEvent.setup();
    await mount({ view: "settings", seen: false, ready: false });
    await screen.findByRole("dialog", { name: "settings" });
    await user.keyboard("{Escape}");
    act(() => worlds[0]!.callbacks.onReady());
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a deep-linked overlay without greeting", async () => {
    await mount({ view: "songs", seen: false });
    expect(await screen.findByRole("dialog", { name: "our songs" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "a little guide" })).toBeNull();
  });
});

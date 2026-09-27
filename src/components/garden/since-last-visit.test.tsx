const { preferences } = vi.hoisted(() => ({ preferences: { current: null as null | { state: { gentle_motion: boolean } } } }));
vi.mock("@/components/settings/member-preferences", () => ({ useMemberPreferences: () => preferences.current }));
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gardenFixture } from "@/test/garden-fixture";
import type { AchievementResult } from "@/lib/achievements/model";
import type { GardenState, Plant } from "@/lib/garden/model";
import { publishBadges, snapshotKey } from "@/lib/garden/since-last-visit";
import { NewBadgeMark } from "./new-badge-mark";
import { SinceLastVisit } from "./since-last-visit";

function plant(state: GardenState, id: string, type: Plant["flower"]["type_key"], spot: number): Plant {
  const base = state.plants[0];
  return { ...base, flower: { ...base.flower, id, type_key: type, spot, is_initial: false }, entries: [] };
}
function garden(change: (state: GardenState) => void = () => {}) {
  const state = gardenFixture();
  state.plants.push(plant(state, "rose-1", "rose", 2), plant(state, "tulip-1", "tulip", 3));
  change(state);
  return state;
}
function achievements(earned: { id: string; title: string }[]): AchievementResult {
  return {
    error: null,
    state: {
      server_now: "2026-09-18T17:00:00Z",
      current_streak: 3,
      achievements: earned.map((badge, index) => ({
        achievement_id: badge.id, position: index + 1, title: badge.title, target: 1, unit: "", requirement: "", progress: 1, earned_at: "2026-09-18T17:00:00Z",
      })),
    },
  };
}
const firstSeed = { id: "first-seed", title: "First seed" };
const streak = { id: "streak-3", title: "Three-day streak" };
const key = snapshotKey(gardenFixture());

function renderCard(state: GardenState, earned = [firstSeed]) {
  const openSpot = vi.fn();
  const focusGarden = vi.fn();
  const loadAchievements = vi.fn(async () => achievements(earned));
  const view = render(
    <>
      <button type="button">Somewhere else</button>
      <SinceLastVisit state={state} openSpot={openSpot} focusGarden={focusGarden} loadAchievements={loadAchievements} />
      <NewBadgeMark viewing={false} />
    </>,
  );
  return { ...view, openSpot, focusGarden, loadAchievements };
}
// A previous visit: render once, let achievements load, then unmount.
async function visit(state: GardenState, earned = [firstSeed]) {
  const view = renderCard(state, earned);
  await waitFor(() => expect(view.loadAchievements).toHaveBeenCalled());
  await waitFor(() => expect(JSON.parse(localStorage.getItem(key)!).badges).not.toBeNull());
  view.unmount();
}

beforeEach(() => {
  localStorage.clear();
  preferences.current = null;
  publishBadges({ key: null, unread: 0 });
});
afterEach(() => vi.restoreAllMocks());

describe("While you were away", () => {
  it("shows nothing on a first visit and keeps a snapshot of ids only", async () => {
    const view = renderCard(garden((s) => {
      s.plants[1].flower.first_bloom_at = s.server_now;
      s.plants[1].member2_submitted = true;
      s.plants[1].flower.shared_wish = "our private wish";
    }));
    await waitFor(() => expect(view.loadAchievements).toHaveBeenCalled());
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key)!).badges).toEqual(["first-seed"]));
    expect(screen.queryByRole("region", { name: /While you were away/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(localStorage.getItem(key)).not.toMatch(/private/);
    expect(document.querySelector("[data-since-last-visit]")).toBeNull();
  });

  it("celebrates blooms, unlocks, partner care and badges since the last visit without taking focus", async () => {
    const user = userEvent.setup();
    await visit(garden());
    const other = () => screen.getByRole("button", { name: "Somewhere else" });
    const view = renderCard(garden((s) => {
      s.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z";
      s.unlocks.push({ type_key: "daisy", unlocked_at: "2026-09-19T11:00:00Z" });
      s.plants[1].member2_submitted = true;
      s.plants[2].member2_submitted = true;
    }), [firstSeed, streak]);
    other().focus();
    const card = await screen.findByRole("region", { name: "While you were away" });
    await waitFor(() => expect(within(card).getByRole("link", { name: /New badge: Three-day streak/ })).toHaveAttribute("href", "/achievements"));
    expect(other()).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "While you were away: Your Rose bloomed. Daisy unlocked. Your partner cared for Rose and Tulip. New badge: Three-day streak.",
    );
    // The hotbar dot names the unread badge.
    expect(screen.getByText(", 1 new badge")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: /Your Rose bloomed/ }));
    expect(view.openSpot).toHaveBeenLastCalledWith(2);
    await user.click(within(card).getByRole("button", { name: /Daisy unlocked/ }));
    expect(view.openSpot).toHaveBeenLastCalledWith(4);
    await user.click(within(card).getByRole("button", { name: "Visit Tulip, spot 3" }));
    expect(view.openSpot).toHaveBeenLastCalledWith(3);
  });

  describe("while the garden guide holds the card", () => {
    const news = () => garden((s) => {
      s.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z";
      s.plants[2].member2_submitted = true;
    });
    const props = (state: GardenState) => ({ state, openSpot: vi.fn(), focusGarden: vi.fn(), loadAchievements: vi.fn(async () => achievements([firstSeed])) });
    const card = () => screen.queryByRole("region", { name: "While you were away" });
    const stored = () => JSON.parse(localStorage.getItem(key)!);
    async function settle(p: ReturnType<typeof props>) {
      await waitFor(() => expect(p.loadAchievements).toHaveBeenCalled());
      await act(async () => {});
    }
    async function expectShownOnce(view: ReturnType<typeof render>, p: ReturnType<typeof props>) {
      view.rerender(<SinceLastVisit {...p} hold={false} />);
      const shown = await screen.findByRole("region", { name: "While you were away" });
      expect(shown).toHaveTextContent("Your Rose bloomed");
      expect(shown).toHaveTextContent("Your partner cared for Tulip");
      expect(within(shown).getAllByRole("listitem")).toHaveLength(2);
      expect(stored().pending).toBeUndefined();
      // Never again: a later visit with the guide closed shows nothing.
      view.unmount();
      const later = props(p.state);
      render(<SinceLastVisit {...later} />);
      await settle(later);
      expect(card()).not.toBeInTheDocument();
    }

    it("stores held news with the snapshot as ids only and shows nothing meanwhile", async () => {
      await visit(garden());
      const p = props(news());
      render(<SinceLastVisit {...p} hold />);
      await settle(p);
      expect(card()).not.toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(stored().blooms).toContain("rose-1");
      expect(stored().pending).toEqual({ blooms: ["rose-1"], unlocks: [], partnerCare: ["tulip-1"], badges: [] });
    });

    it("shows held news once after the guide yields to a sheet, returns and closes", async () => {
      await visit(garden());
      const p = props(news());
      const view = render(<SinceLastVisit {...p} hold />);
      await settle(p);
      // The member taps the flower the guide points at: the guide yields to the sheet.
      view.rerender(<SinceLastVisit {...p} hold quiet />);
      view.rerender(<SinceLastVisit {...p} hold={false} quiet />);
      await act(async () => {});
      // The sheet closes and the guide returns in the same render.
      view.rerender(<SinceLastVisit {...p} hold quiet={false} />);
      await act(async () => {});
      expect(card()).not.toBeInTheDocument();
      await expectShownOnce(view, p);
    });

    it("shows held news once after a sheet round trip and a reload, then the guide closing", async () => {
      await visit(garden());
      const p = props(news());
      const first = render(<SinceLastVisit {...p} hold />);
      await settle(p);
      first.rerender(<SinceLastVisit {...p} hold quiet />);
      first.rerender(<SinceLastVisit {...p} hold={false} quiet />);
      await act(async () => {});
      first.unmount();
      const again = props(p.state);
      const view = render(<SinceLastVisit {...again} hold />);
      await settle(again);
      expect(card()).not.toBeInTheDocument();
      await expectShownOnce(view, again);
    });

    it("shows held news once after a reload with the guide still open", async () => {
      await visit(garden());
      const p = props(news());
      render(<SinceLastVisit {...p} hold />).unmount();
      await act(async () => {});
      const again = props(p.state);
      const view = render(<SinceLastVisit {...again} hold />);
      await settle(again);
      expect(card()).not.toBeInTheDocument();
      await expectShownOnce(view, again);
    });

    it("stores partner care that arrives while a guide-driven sheet is open, so a reload keeps it", async () => {
      await visit(garden());
      const p = props(garden());
      const view = render(<SinceLastVisit {...p} hold />);
      await settle(p);
      // The guide yields to a sheet, and the partner cares while it is open.
      view.rerender(<SinceLastVisit {...p} hold={false} quiet />);
      await act(async () => {});
      const cared = { ...p, state: garden((s) => { s.plants[2].member2_submitted = true; }) };
      view.rerender(<SinceLastVisit {...cared} hold={false} quiet />);
      await act(async () => {});
      // The sheet closes and the guide returns: the care joins the stored list.
      view.rerender(<SinceLastVisit {...cared} hold />);
      await act(async () => {});
      expect(stored().pending?.partnerCare).toEqual(["tulip-1"]);
      view.unmount();
      const again = props(cared.state);
      const reloaded = render(<SinceLastVisit {...again} hold />);
      await settle(again);
      expect(card()).not.toBeInTheDocument();
      reloaded.rerender(<SinceLastVisit {...again} hold={false} />);
      const shown = await screen.findByRole("region", { name: "While you were away" });
      expect(shown).toHaveTextContent("Your partner cared for Tulip");
      expect(within(shown).getAllByRole("listitem")).toHaveLength(1);
      expect(stored().pending).toBeUndefined();
    });

    it("shows partner care from a guide-driven sheet once when the guide closes without a reload", async () => {
      await visit(garden());
      const p = props(garden());
      const view = render(<SinceLastVisit {...p} hold />);
      await settle(p);
      view.rerender(<SinceLastVisit {...p} hold={false} quiet />);
      const cared = { ...p, state: garden((s) => { s.plants[2].member2_submitted = true; }) };
      view.rerender(<SinceLastVisit {...cared} hold={false} quiet />);
      view.rerender(<SinceLastVisit {...cared} hold />);
      await act(async () => {});
      view.rerender(<SinceLastVisit {...cared} hold={false} />);
      const shown = await screen.findByRole("region", { name: "While you were away" });
      expect(within(shown).getAllByRole("listitem")).toHaveLength(1);
      expect(shown).toHaveTextContent("Your partner cared for Tulip");
    });

    it("never adds the viewer's own bloom to the waiting list", async () => {
      await visit(garden());
      const mine = garden((s) => { s.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z"; });
      const p = { ...props(mine), ownResult: mine };
      const view = render(<SinceLastVisit {...p} hold />);
      await settle(p);
      expect(stored().pending).toBeUndefined();
      view.rerender(<SinceLastVisit {...p} hold={false} />);
      await act(async () => {});
      expect(card()).not.toBeInTheDocument();
    });

    it("stays silent and safe when storage fails while held", async () => {
      await visit(garden());
      const p = props(news());
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
      const view = render(<SinceLastVisit {...p} hold />);
      await settle(p);
      view.rerender(<SinceLastVisit {...p} hold={false} />);
      await act(async () => {});
      expect(card()).not.toBeInTheDocument();
    });
  });

  it("dismisses, returns focus to the garden, and does not celebrate the same news again", async () => {
    const user = userEvent.setup();
    await visit(garden());
    const bloomed = garden((s) => { s.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z"; });
    const view = renderCard(bloomed);
    const card = await screen.findByRole("region", { name: "While you were away" });
    await user.click(within(card).getByRole("button", { name: "Dismiss While you were away" }));
    expect(screen.queryByRole("region", { name: "While you were away" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(view.focusGarden).toHaveBeenCalledTimes(1);

    // A live refresh with nothing new keeps it closed.
    view.rerender(
      <SinceLastVisit state={garden((s) => { s.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z"; })} openSpot={view.openSpot} focusGarden={view.focusGarden} loadAchievements={view.loadAchievements} />,
    );
    expect(screen.queryByRole("region", { name: "While you were away" })).not.toBeInTheDocument();
    // New partner care arrives live: only the new line appears.
    view.rerender(
      <SinceLastVisit state={garden((s) => { s.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z"; s.plants[2].member2_submitted = true; })} openSpot={view.openSpot} focusGarden={view.focusGarden} loadAchievements={view.loadAchievements} />,
    );
    const again = await screen.findByRole("region", { name: "While you were away" });
    expect(within(again).getByText("Your partner cared for Tulip")).toBeInTheDocument();
    expect(within(again).queryByText(/bloomed/)).not.toBeInTheDocument();
    view.unmount();

    // A reload does not repeat what was already shown.
    renderCard(garden((s) => { s.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z"; s.plants[2].member2_submitted = true; }));
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "While you were away" })).not.toBeInTheDocument();
  });

  it("shows nothing and does not throw when storage is unavailable", async () => {
    await visit(garden());
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    renderCard(garden((s) => { s.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z"; }));
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "While you were away" })).not.toBeInTheDocument();
  });

  it("shows nothing when the snapshot cannot be saved", async () => {
    await visit(garden());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    renderCard(garden((s) => { s.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z"; }));
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "While you were away" })).not.toBeInTheDocument();
  });

  it("pops pixel confetti only when gentle motion is on", async () => {
    await visit(garden());
    const bloom = (s: GardenState) => { s.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z"; };
    // Unavailable preferences keep it off, like the member's motion-off style.
    const unknown = renderCard(garden(bloom));
    expect((await screen.findByRole("region", { name: "While you were away" })).querySelector("i")).toBeNull();
    unknown.unmount();
    localStorage.clear();
    await visit(garden());
    preferences.current = { state: { gentle_motion: false } };
    const quiet = renderCard(garden(bloom));
    const card = await screen.findByRole("region", { name: "While you were away" });
    expect(card.querySelector("i")).toBeNull();
    quiet.unmount();
    localStorage.clear();
    await visit(garden());
    preferences.current = { state: { gentle_motion: true } };
    renderCard(garden(bloom));
    const lively = await screen.findByRole("region", { name: "While you were away" });
    expect(lively.querySelectorAll("i").length).toBeGreaterThan(0);
  });

  it("moves the snapshot silently for a state returned by your own action", async () => {
    await visit(garden());
    const own = garden((s) => {
      s.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z";
      s.unlocks.push({ type_key: "daisy", unlocked_at: "2026-09-19T11:00:00Z" });
    });
    const openSpot = vi.fn(), focusGarden = vi.fn();
    const loadAchievements = vi.fn(async () => achievements([firstSeed]));
    render(<SinceLastVisit state={own} ownResult={own} openSpot={openSpot} focusGarden={focusGarden} loadAchievements={loadAchievements} />);
    await waitFor(() => expect(loadAchievements).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "While you were away" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-since-last-visit] i")).toBeNull();
    expect(JSON.parse(localStorage.getItem(key)!).blooms).toContain("rose-1");
  });

  it("holds partner care while a sheet is open, absorbs blooms, then shows the care after it closes", async () => {
    await visit(garden());
    const openSpot = vi.fn(), focusGarden = vi.fn();
    const loadAchievements = vi.fn(async () => achievements([firstSeed]));
    const changed = garden((s) => {
      s.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z";
      s.plants[2].member2_submitted = true;
    });
    const view = render(<SinceLastVisit state={changed} quiet openSpot={openSpot} focusGarden={focusGarden} loadAchievements={loadAchievements} />);
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "While you were away" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
    view.rerender(<SinceLastVisit state={changed} quiet={false} openSpot={openSpot} focusGarden={focusGarden} loadAchievements={loadAchievements} />);
    const card = await screen.findByRole("region", { name: "While you were away" });
    expect(within(card).getByText("Your partner cared for Tulip")).toBeInTheDocument();
    expect(within(card).queryByText(/bloomed/)).not.toBeInTheDocument();
  });

  describe("badges earned by your own action", () => {
    const third = { id: "blooms-10", title: "Ten blooms" };
    const props = (loadAchievements: () => Promise<AchievementResult>) => ({ openSpot: vi.fn(), focusGarden: vi.fn(), loadAchievements });
    const stored = () => JSON.parse(localStorage.getItem(key)!);
    const acted = () => garden((s) => { s.garden.current_streak = 3; });

    it("stays silent on the next visit when you leave before the badge read", async () => {
      await visit(garden());
      let earned = [firstSeed];
      const load = vi.fn(async () => achievements(earned));
      const first = render(<SinceLastVisit state={garden()} {...props(load)} />);
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      const own = acted();
      earned = [firstSeed, streak];
      first.rerender(<SinceLastVisit state={own} ownResult={own} {...props(load)} />);
      await waitFor(() => expect(stored().badgesPending).toBe(true));
      first.unmount(); // Left within the 1.5s read delay.
      expect(load).toHaveBeenCalledTimes(1);

      const next = render(<SinceLastVisit state={acted()} {...props(load)} />);
      await waitFor(() => expect(stored().badges).toEqual(["first-seed", "streak-3"]));
      expect(stored().badgesPending).toBe(false);
      expect(screen.queryByRole("region", { name: "While you were away" })).not.toBeInTheDocument();
      // Once settled, a later badge is news again.
      earned = [firstSeed, streak, third];
      next.rerender(<SinceLastVisit state={garden((s) => { s.garden.current_streak = 3; s.garden.qualifying_days = 9; })} {...props(load)} />);
      const card = await screen.findByRole("region", { name: "While you were away" }, { timeout: 3000 });
      expect(within(card).getByText("New badge: Ten blooms")).toBeInTheDocument();
    });

    it("stays silent after a failed badge read until one succeeds", async () => {
      await visit(garden());
      let fail = false;
      const load = vi.fn(async () => {
        if (fail) throw new Error("offline");
        return achievements([firstSeed, streak]);
      });
      const view = render(<SinceLastVisit state={garden()} {...props(vi.fn(async () => achievements([firstSeed])))} />);
      await act(async () => {});
      fail = true;
      const own = acted();
      view.rerender(<SinceLastVisit state={own} ownResult={own} {...props(load)} />);
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1), { timeout: 3000 });
      expect(stored().badgesPending).toBe(true);
      fail = false;
      view.rerender(<SinceLastVisit state={garden((s) => { s.garden.current_streak = 3; s.garden.qualifying_days = 9; })} {...props(load)} />);
      await waitFor(() => expect(stored().badges).toEqual(["first-seed", "streak-3"]), { timeout: 3000 });
      expect(stored().badgesPending).toBe(false);
      expect(screen.queryByRole("region", { name: "While you were away" })).not.toBeInTheDocument();
    });

    it("stays silent when another change restarts the badge read, and still shows partner care", async () => {
      await visit(garden());
      let earned = [firstSeed];
      const load = vi.fn(async () => achievements(earned));
      const view = render(<SinceLastVisit state={garden()} {...props(load)} />);
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      const own = acted();
      earned = [firstSeed, streak];
      view.rerender(<SinceLastVisit state={own} ownResult={own} {...props(load)} />);
      // Partner care lands within 1.5s and restarts the read timer.
      const partner = garden((s) => { s.garden.current_streak = 3; s.plants[2].member2_submitted = true; s.plants[2].entries = [{ id: 9, flower_id: "tulip-1", author_id: 2, garden_day: s.garden_day, original_posted_at: s.server_now, updated_at: s.server_now, payload: {}, daisy_assignment_day: null }]; });
      view.rerender(<SinceLastVisit state={partner} ownResult={own} {...props(load)} />);
      const card = await screen.findByRole("region", { name: "While you were away" });
      expect(within(card).getByText("Your partner cared for Tulip")).toBeInTheDocument();
      await waitFor(() => expect(load).toHaveBeenCalledTimes(2), { timeout: 3000 });
      await waitFor(() => expect(stored().badges).toEqual(["first-seed", "streak-3"]));
      expect(stored().badgesPending).toBe(false);
      expect(within(card).queryByText(/New badge/)).not.toBeInTheDocument();
    });
  });

  it("clears the hotbar dot once the Achievements panel is open", async () => {
    await visit(garden());
    const view = renderCard(garden(), [firstSeed, streak]);
    await screen.findByText(", 1 new badge");
    view.rerender(
      <>
        <SinceLastVisit state={garden()} openSpot={view.openSpot} focusGarden={view.focusGarden} loadAchievements={view.loadAchievements} />
        <NewBadgeMark viewing />
      </>,
    );
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key)!).badgesViewed).toEqual(["first-seed", "streak-3"]));
    expect(screen.queryByText(/new badge$/)).not.toBeInTheDocument();
  });
});

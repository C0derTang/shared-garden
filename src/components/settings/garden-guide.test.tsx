import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const { refreshGarden, mutateGarden, readSettings, saveSetting } = vi.hoisted(() => ({ refreshGarden: vi.fn(), mutateGarden: vi.fn(), readSettings: vi.fn(), saveSetting: vi.fn() }));
vi.mock("@/lib/settings/actions", () => ({ readSettings, saveSetting }));
vi.mock("@/lib/garden/actions", () => ({ refreshGarden, mutateGarden, loadFlowerHistory: vi.fn() }));
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
import { GardenClient } from "@/components/garden/garden-client";
import { MemberPreferences } from "./member-preferences";
import { gardenFixture } from "@/test/garden-fixture";
vi.mock("@/lib/peony/actions", () => ({ readPeony: vi.fn(), mutatePeony: vi.fn() }));
const settings = { state: { revision: 0, guide: "open" as const, gentle_motion: true }, error: null };
function show(state = gardenFixture()) {
  refreshGarden.mockResolvedValue({ state, error: null });
  return render(<MemberPreferences initial={settings}><GardenClient initial={{ state, error: null }} /></MemberPreferences>);
}
beforeEach(() => { vi.clearAllMocks(); readSettings.mockResolvedValue(settings); });
it("opens the real Cactus sheet without creating care, then advances only from returned facts", async () => {
  const state = gardenFixture(); show(state);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Visit Cactus" }));
  expect(mutateGarden).not.toHaveBeenCalled();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  const next = structuredClone(state); next.tutorial_facts.cactus_checked_in = true; next.server_now = "2026-09-18T17:00:01Z";
  mutateGarden.mockResolvedValue({ state: next, saved: true, error: null });
  await user.click(screen.getByRole("button", { name: "I’m here · Check in" }));
  expect(mutateGarden).toHaveBeenCalledExactlyOnceWith({ kind: "submit", flowerId: state.plants[0].flower.id, payload: {} });
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "Choose a Rose seed" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Choose a Rose seed" }));
  const sheet = screen.getByRole("dialog");
  for (const type of ["Rose", "Tulip", "Marigold"]) expect(within(sheet).getByRole("button", { name: new RegExp(type) })).toBeEnabled();
  expect(mutateGarden).toHaveBeenCalledTimes(1);
});
it("does not advance on a failed care or a success receipt without refreshed facts", async () => {
  show(); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Visit Cactus" }));
  mutateGarden.mockResolvedValue({ state: null, saved: false, error: "Not confirmed" });
  await user.click(screen.getByRole("button", { name: "I’m here · Check in" }));
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "Visit Cactus" })).toBeInTheDocument();
  expect(mutateGarden).toHaveBeenCalledTimes(1);
});
it("uses the existing Rose and keeps its active draft through partner updates", async () => {
  const state = gardenFixture(); state.member_id = 2;
  state.plants.push({ ...structuredClone(state.plants[0]), flower: { ...state.plants[0].flower, id: "rose-two", type_key: "rose", spot: 2 } });
  show(state); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Visit Rose" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Note about today" }), { target: { value: "Keep my note" } });
  const next = structuredClone(state); next.server_now = "2026-09-18T17:00:01Z"; next.plants[1].member1_submitted = true;
  refreshGarden.mockResolvedValue({ state: next, error: null });
  fireEvent.focus(window);
  await screen.findByText("Partner · cared today");
  expect(screen.getByRole("textbox")).toHaveValue("Keep my note");
  expect(mutateGarden).not.toHaveBeenCalled();
});
it("keeps close usable during a delayed skip and reports unsuccessful durable skip", async () => {
  show(); let resolve!: (value: unknown) => void;
  saveSetting.mockReturnValue(new Promise((done) => { resolve = done; }));
  fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
  expect(screen.getByRole("button", { name: "Close guide for now" })).toBeEnabled();
  await act(async () => resolve({ state: null, error: "Not confirmed" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Not confirmed");
  fireEvent.click(screen.getByRole("button", { name: "Close guide for now" }));
  expect(screen.queryByRole("button", { name: "Visit Cactus" })).not.toBeInTheDocument();
  expect(mutateGarden).not.toHaveBeenCalled();
});
it("shows no guide after durable skip and does not force care for permanent Roses", async () => {
  readSettings.mockResolvedValue({ state: { ...settings.state, revision: 1, guide: "skipped" }, error: null });
  const state = gardenFixture(); state.tutorial_facts.cactus_checked_in = true;
  state.plants.push({ ...structuredClone(state.plants[0]), flower: { ...state.plants[0].flower, type_key: "rose", id: "bloom", spot: 2, first_bloom_at: state.server_now } });
  show(state);
  expect(screen.getByRole("button", { name: "Finish guide" })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("region", { name: "Garden guide" })).not.toBeInTheDocument());
  expect(mutateGarden).not.toHaveBeenCalled();
});

it("pauses guide actions after a confirmed save with a lost refresh, then reconciles later facts without another mutation", async () => {
  const state = gardenFixture(); show(state);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Visit Cactus" }));
  refreshGarden.mockResolvedValue({ state: null, error: "Refresh unavailable" });
  mutateGarden.mockResolvedValue({ state: null, saved: true, error: "Saved, but refresh unavailable" });
  await user.click(screen.getByRole("button", { name: "I’m here · Check in" }));
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "Visit Cactus" })).toBeDisabled();
  expect(mutateGarden).toHaveBeenCalledTimes(1);
  const next = structuredClone(state); next.server_now = "2026-09-18T17:00:02Z"; next.tutorial_facts.cactus_checked_in = true;
  refreshGarden.mockResolvedValue({ state: next, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("button", { name: "Choose a Rose seed" });
  expect(mutateGarden).toHaveBeenCalledTimes(1);
});

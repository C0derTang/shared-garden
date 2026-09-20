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
  expect(screen.getByRole("button", { name: "Visit Cactus" })).toHaveAttribute("aria-disabled", "true");
  expect(mutateGarden).toHaveBeenCalledTimes(1);
  const next = structuredClone(state); next.server_now = "2026-09-18T17:00:02Z"; next.tutorial_facts.cactus_checked_in = true;
  refreshGarden.mockResolvedValue({ state: next, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("button", { name: "Choose a Rose seed" });
  expect(mutateGarden).toHaveBeenCalledTimes(1);
});

async function activateWithKeyboard(user: ReturnType<typeof userEvent.setup>, button: HTMLElement) {
  for (let tabs = 0; document.activeElement !== button && tabs < 30; tabs++) await user.tab();
  expect(button).toHaveFocus();
  await user.keyboard("{Enter}");
}

it("hands keyboard focus to the collapsed control and then the reopened guide heading", async () => {
  show(); const user = userEvent.setup();
  await activateWithKeyboard(user, screen.getByRole("button", { name: "Close guide for now" }));
  const reopen = screen.getByRole("button", { name: "Show garden guide" });
  expect(reopen).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("heading", { name: "A little hello" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Visit Cactus" })).toHaveFocus();
  expect(saveSetting).not.toHaveBeenCalled();
  expect(mutateGarden).not.toHaveBeenCalled();
});

it.each(["Skip", "Finish"] as const)("hands keyboard focus to the garden after confirmed %s", async (action) => {
  const state = gardenFixture();
  state.tutorial_facts = { cactus_checked_in: true, rose_noted: true };
  show(state); const user = userEvent.setup();
  const guide = action === "Skip" ? "skipped" : "finished";
  saveSetting.mockResolvedValue({ state: { ...settings.state, revision: 1, guide }, error: null });
  await activateWithKeyboard(user, screen.getByRole("button", { name: `${action} guide` }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Garden guide" })).not.toBeInTheDocument());
  expect(screen.getByRole("heading", { name: "Our shared garden" })).toHaveFocus();
  expect(saveSetting).toHaveBeenCalledExactlyOnceWith({ guide });
  expect(mutateGarden).not.toHaveBeenCalled();
});

it.each(["Skip", "Finish"])("retains keyboard focus during a delayed unsuccessful %s and permits closing afterward", async (action) => {
  const state = gardenFixture(); state.tutorial_facts = { cactus_checked_in: true, rose_noted: true };
  show(state); const user = userEvent.setup();
  let resolve!: (value: unknown) => void;
  saveSetting.mockReturnValue(new Promise((done) => { resolve = done; }));
  const skip = screen.getByRole("button", { name: `${action} guide` });
  await activateWithKeyboard(user, skip);
  expect(skip).toHaveFocus();
  expect(skip).toHaveAttribute("aria-disabled", "true");
  await user.keyboard("{Enter}");
  expect(saveSetting).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ state: null, error: "Not confirmed" }));
  expect(skip).toHaveFocus();
  expect(screen.getByRole("alert")).toHaveTextContent("Not confirmed");
  await activateWithKeyboard(user, screen.getByRole("button", { name: "Close guide for now" }));
  expect(screen.getByRole("button", { name: "Show garden guide" })).toHaveFocus();
});

it("hands focus onward when a delayed Skip confirms after the member locally closes the guide", async () => {
  show(); const user = userEvent.setup();
  let resolve!: (value: unknown) => void;
  saveSetting.mockReturnValue(new Promise((done) => { resolve = done; }));
  await activateWithKeyboard(user, screen.getByRole("button", { name: "Skip guide" }));
  await activateWithKeyboard(user, screen.getByRole("button", { name: "Close guide for now" }));
  expect(screen.getByRole("button", { name: "Show garden guide" })).toHaveFocus();
  await act(async () => resolve({ state: { ...settings.state, revision: 1, guide: "skipped" }, error: null }));
  expect(screen.getByRole("heading", { name: "Our shared garden" })).toHaveFocus();
});

it.each(["pending save", "remote refresh"])("does not take focus from a flower draft when a %s hides the guide", async (source) => {
  const state = gardenFixture();
  state.plants.push({ ...structuredClone(state.plants[0]), flower: { ...state.plants[0].flower, id: "rose-two", type_key: "rose", spot: 2 } });
  show(state); const user = userEvent.setup();
  let resolve!: (value: unknown) => void;
  if (source === "pending save") {
    saveSetting.mockReturnValue(new Promise((done) => { resolve = done; }));
    await activateWithKeyboard(user, screen.getByRole("button", { name: "Skip guide" }));
  } else {
    await activateWithKeyboard(user, screen.getByRole("button", { name: "Close guide for now" }));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "A note for your Rose" })).toHaveFocus();
  }
  await user.click(screen.getByRole("button", { name: "Visit Rose" }));
  const draft = screen.getByRole("textbox", { name: "Note about today" });
  await user.type(draft, "Keep my focused note");
  const result = { state: { ...settings.state, revision: 1, guide: "skipped" }, error: null };
  if (source === "pending save") await act(async () => resolve(result));
  else { readSettings.mockResolvedValue(result); fireEvent.focus(window); }
  await waitFor(() => expect(screen.queryByRole("region", { name: "Garden guide", hidden: true })).not.toBeInTheDocument());
  expect(draft).toHaveFocus();
  expect(draft).toHaveValue("Keep my focused note");
  expect(mutateGarden).not.toHaveBeenCalled();
});

it.each([
  ["cactus", "Visit Cactus"],
  ["plant", "Choose a Rose seed"],
  ["rose", "Visit Rose"],
  ["blooms", "Visit a blooming Rose"],
])("keeps the %s step reachable and inert after a background refresh fails", async (kind, label) => {
  const state = gardenFixture();
  if (kind === "plant") state.tutorial_facts.cactus_checked_in = true;
  if (kind === "rose" || kind === "blooms") state.plants.push({
    ...structuredClone(state.plants[0]),
    flower: { ...state.plants[0].flower, id: "guide-rose", type_key: "rose", spot: 2, first_bloom_at: kind === "blooms" ? state.server_now : null },
  });
  show(state); const user = userEvent.setup();
  const step = screen.getByRole("button", { name: label });
  for (let tabs = 0; document.activeElement !== step && tabs < 30; tabs++) await user.tab();
  expect(step).toHaveFocus();
  let resolve!: (value: unknown) => void;
  refreshGarden.mockReturnValue(new Promise((done) => { resolve = done; }));
  fireEvent.focus(window);
  expect(step).toHaveFocus();
  await act(async () => resolve({ state: null, error: "Refresh unavailable" }));
  expect(step).toHaveFocus();
  expect(step).toHaveAttribute("aria-disabled", "true");
  expect(step).not.toBeDisabled();
  await user.keyboard("{Enter} ");
  await user.click(step);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: label })).toHaveFocus();
  expect(mutateGarden).not.toHaveBeenCalled();
  expect(saveSetting).not.toHaveBeenCalled();
  await user.tab();
  await user.tab({ shift: true });
  expect(step).toHaveFocus();
  refreshGarden.mockResolvedValue({ state, error: null });
  fireEvent.focus(window);
  await waitFor(() => expect(step).toHaveAttribute("aria-disabled", "false"));
  expect(step).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("keeps the step reachable and inert while garden care is still saving", async () => {
  show(); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Visit Cactus" }));
  let resolve!: (value: unknown) => void;
  mutateGarden.mockReturnValue(new Promise((done) => { resolve = done; }));
  await user.click(screen.getByRole("button", { name: "I’m here · Check in" }));
  await user.click(screen.getByRole("button", { name: "Close" }));
  const step = screen.getByRole("button", { name: "Visit Cactus" });
  expect(step).toHaveAttribute("aria-disabled", "true");
  for (let tabs = 0; document.activeElement !== step && tabs < 30; tabs++) await user.tab();
  expect(step).toHaveFocus();
  await user.keyboard("{Enter} ");
  await user.click(step);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(step).toHaveFocus();
  expect(mutateGarden).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ state: null, saved: false, error: "Not confirmed" }));
  expect(step).toHaveFocus();
});

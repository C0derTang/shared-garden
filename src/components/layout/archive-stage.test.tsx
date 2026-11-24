vi.mock("@/lib/replies/actions", () => ({ readReplies: vi.fn().mockResolvedValue({ replies: [], error: null }), saveReply: vi.fn() }));
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const route = vi.hoisted(() => ({ href: "/legacy", back: vi.fn(), replace: vi.fn(), push: vi.fn() }));
const api = vi.hoisted(() => ({ refreshGarden: vi.fn(), mutateGarden: vi.fn(), loadFlowerHistory: vi.fn(), readSettings: vi.fn(), saveSetting: vi.fn(), readPrivateInteraction: vi.fn(), controlPrivateInteraction: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URL(route.href, "http://garden.test").searchParams, useRouter: () => route }));
vi.mock("@/lib/peony/actions", () => ({ readPeony: vi.fn(), mutatePeony: vi.fn() }));
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
vi.mock("@/lib/garden/actions", () => ({ refreshGarden: api.refreshGarden, mutateGarden: api.mutateGarden, loadFlowerHistory: api.loadFlowerHistory }));
vi.mock("@/lib/settings/actions", () => ({ readSettings: api.readSettings, saveSetting: api.saveSetting }));
vi.mock("@/lib/private-interaction/actions", () => ({ readPrivateInteraction: api.readPrivateInteraction, controlPrivateInteraction: api.controlPrivateInteraction }));
import { GardenStage } from "@/components/layout/garden-stage";
import { SheetScope } from "@/components/ui/sheet-scope";
import { MemberPreferences } from "@/components/settings/member-preferences";
import { SettingsClient } from "@/components/settings/settings-client";
import { entryFixture, gardenFixture } from "@/test/garden-fixture";

// The legacy stage is the frozen archive (decision 0067, issue #176). Even a
// member whose guide preference is still "open" sees only read paths.
const settings = { state: { revision: 0, guide: "open" as const, gentle_motion: true }, error: null };
function archive() {
  const state = gardenFixture();
  state.plants[0].entries = [{ ...entryFixture(), payload: {} }];
  state.plants[0].member1_submitted = true;
  return state;
}
let state = archive();
function App() { return <MemberPreferences initial={settings}><SheetScope><GardenStage initial={{ state, error: null }}><SettingsClient /></GardenStage></SheetScope></MemberPreferences>; }
beforeEach(() => {
  vi.clearAllMocks(); route.href = "/legacy"; state = archive();
  api.refreshGarden.mockResolvedValue({ state, error: null }); api.readSettings.mockResolvedValue(settings);
  api.saveSetting.mockResolvedValue(settings); api.readPrivateInteraction.mockResolvedValue({ state: { status: "idle" }, error: null });
  api.loadFlowerHistory.mockResolvedValue({ entries: [{ ...entryFixture(), payload: {} }], error: null });
});
it("shows the archive note and no guide, care prompts, Today card or bare-soil planting", () => {
  render(<App />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /garden guide/i })).not.toBeInTheDocument();
  expect(screen.getByText("Archived garden · read-only")).toBeVisible();
  expect(screen.queryByText(/New day in/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Plant in spot/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: /today/i })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cactus, spot 1, 0 of 10 growth units" })).toBeVisible();
});
it("opens a flower read-only: progress and history, with no check-in, edit or reply controls", async () => {
  const user = userEvent.setup(); render(<App />);
  await user.click(screen.getByRole("button", { name: /^Cactus, spot 1/ }));
  const sheet = await screen.findByRole("dialog", { name: "Cactus" });
  expect(within(sheet).getByRole("progressbar", { name: "Cactus progress" })).toBeVisible();
  expect(within(sheet).getByText(/no longer grows or changes/)).toBeInTheDocument();
  expect(within(sheet).queryByRole("button", { name: /Check in/ })).not.toBeInTheDocument();
  expect(within(sheet).queryByRole("button", { name: /Edit your entry/ })).not.toBeInTheDocument();
  expect(within(sheet).queryByRole("region", { name: "Today's entries" })).not.toBeInTheDocument();
  await user.click(within(sheet).getByRole("button", { name: "Read history" }));
  expect(api.loadFlowerHistory).toHaveBeenCalledWith(state.plants[0].flower.id, null);
  expect(await within(sheet).findByText("Checked in. I’m here.")).toBeVisible();
  expect(within(sheet).queryByRole("textbox")).not.toBeInTheDocument();
  expect(within(sheet).queryByRole("button", { name: /reply/i })).not.toBeInTheDocument();
  expect(api.mutateGarden).not.toHaveBeenCalled();
});
it("keeps a focused flower control through panel navigation and presents the panel after it closes", async () => {
  const user = userEvent.setup(); const view = render(<App />);
  await user.click(screen.getByRole("button", { name: /^Cactus, spot 1/ }));
  const history = await screen.findByRole("button", { name: "Read history" }); history.focus();
  route.href = "/legacy?panel=settings"; view.rerender(<App />);
  expect(history).toHaveFocus();
  expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(await screen.findByRole("dialog", { name: "Settings" })).toContainElement(document.activeElement as HTMLElement);
});
it("replaces the guide setting with the archive note while shared settings stay usable", async () => {
  const user = userEvent.setup(); route.href = "/legacy?panel=settings"; render(<App />);
  const panel = await screen.findByRole("dialog", { name: "Settings" });
  expect(within(panel).getByRole("heading", { name: "Archived garden · read-only" })).toBeVisible();
  expect(within(panel).queryByRole("button", { name: "Reopen garden guide" })).not.toBeInTheDocument();
  await user.click(within(panel).getByRole("checkbox", { name: "Allow gentle motion" }));
  expect(api.saveSetting).toHaveBeenCalledWith({ gentle_motion: false });
});

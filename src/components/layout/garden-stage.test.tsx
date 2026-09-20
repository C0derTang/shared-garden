import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const route = vi.hoisted(() => ({ pathname: "/settings", back: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => route }));
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
const api = vi.hoisted(() => ({ readPrivateInteraction: vi.fn(), previewPrivateInteraction: vi.fn() }));
vi.mock("@/lib/private-interaction/actions", () => api);
vi.mock("@/components/garden/garden-client", () => ({ GardenClient: () => <button>Actual garden</button> }));
import { GardenStage } from "./garden-stage";
import { SheetScope } from "@/components/ui/sheet-scope";
import { BottomSheet } from "@/components/ui/bottom-sheet";
const initial = { state: null, error: null };
function App() { return <SheetScope><BottomSheet title="Garden draft" description="Care" trigger={<button>Open garden draft</button>}><input aria-label="Garden draft text" /></BottomSheet><GardenStage initial={initial}><input aria-label="Panel draft" /><BottomSheet title="Memory detail" description="History" trigger={<button>View memory</button>}><input aria-label="Memory draft" /></BottomSheet></GardenStage></SheetScope>; }
beforeEach(() => { vi.clearAllMocks(); route.pathname = "/settings"; api.readPrivateInteraction.mockResolvedValue({ state: { status: "owner", detail: { status: "ready", armed: true, unread: false, answer: null } }, error: null }); });
it("opens direct routes over the inert actual garden and places owner controls inside Settings", async () => {
  render(<App />);
  const panel = await screen.findByRole("dialog", { name: "Settings" });
  expect(screen.getByText("Actual garden").closest("[inert]")).not.toBeNull();
  expect(await within(panel).findByText("PRIVATE OWNER CONTROLS")).toBeVisible();
  await userEvent.click(within(panel).getByRole("button", { name: "Close panel" }));
  expect(route.replace).toHaveBeenCalledWith("/garden", { scroll: false });
});
it("lets a nested sheet open and close without losing the parent draft or trapping focus behind it", async () => {
  const user = userEvent.setup(); render(<App />);
  await user.type(screen.getByLabelText("Panel draft"), "Keep me");
  await user.click(screen.getByRole("button", { name: "View memory" }));
  const detail = await screen.findByRole("dialog", { name: "Memory detail" });
  await user.type(within(detail).getByLabelText("Memory draft"), "Care");
  await user.keyboard("{Escape}");
  expect(screen.getByLabelText("Panel draft")).toHaveValue("Keep me");
  expect(screen.getByRole("button", { name: "View memory" })).toHaveFocus();
  expect(route.replace).not.toHaveBeenCalled();
});
it("keeps one private lifecycle while routes change and delivers pending moments above the panel", async () => {
  let resolve!: (result: unknown) => void;
  api.readPrivateInteraction.mockReturnValue(new Promise((done) => { resolve = done; }));
  const view = render(<App />);
  route.pathname = "/memories"; view.rerender(<App />);
  await act(async () => resolve({ state: { status: "pending", content: { title: "Fixture moment", message: "Synthetic", choices: [{ key: "a", label: "Yes" }, { key: "b", label: "Later" }] } }, error: null }));
  expect(await screen.findByRole("dialog", { name: "Fixture moment" })).toBeVisible();
  expect(api.readPrivateInteraction).toHaveBeenCalledTimes(1);
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Memories" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
});
it("abandons a preview when history leaves Settings and does not revive it on return", async () => {
  const user = userEvent.setup();
  api.previewPrivateInteraction.mockResolvedValue({ content: { title: "Preview fixture", message: "Synthetic", choices: [{ key: "a", label: "Yes" }] }, error: null });
  const view = render(<App />);
  await user.click(await screen.findByRole("button", { name: "Preview privately" }));
  expect(await screen.findByRole("dialog", { name: "Preview — nothing will be sent" })).toBeVisible();
  route.pathname = "/garden"; view.rerender(<App />);
  route.pathname = "/settings"; view.rerender(<App />);
  expect(screen.queryByRole("dialog", { name: "Preview — nothing will be sent" })).not.toBeInTheDocument();
});
it.each([["/memories", "Memories"], ["/achievements", "Achievements"], ["/garden/songs", "Our songs"]])("renders direct %s inside its panel without owner controls", async (path, name) => {
  route.pathname = path;
  render(<App />);
  expect(await screen.findByRole("dialog", { name })).toBeVisible();
  expect(screen.queryByText("PRIVATE OWNER CONTROLS")).not.toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(route.replace).toHaveBeenCalledWith("/garden", { scroll: false });
});
it("traps keyboard focus in the route panel and restores its navigation opener after Back", async () => {
  const user = userEvent.setup(); const view = render(<App />);
  const panel = await screen.findByRole("dialog", { name: "Settings" });
  const buttons = within(panel).getAllByRole("button");
  buttons.at(-1)!.focus();
  await user.keyboard("{Tab}");
  expect(within(panel).getByRole("button", { name: "Close panel" })).toHaveFocus();
  route.pathname = "/garden"; view.rerender(<App />);
  expect(screen.getByRole("link", { name: "Settings" })).toHaveFocus();
  expect(screen.getByText("Actual garden").closest("[inert]")).toBeNull();
  expect(api.readPrivateInteraction).toHaveBeenCalledTimes(1);
});

it("defers a history-opened route panel behind an existing flower draft", async () => {
  route.pathname = "/garden";
  const user = userEvent.setup(); const view = render(<App />);
  await user.click(screen.getByRole("button", { name: "Open garden draft" }));
  await user.type(screen.getByLabelText("Garden draft text"), "Keep the flower thought");
  route.pathname = "/memories"; view.rerender(<App />);
  expect(screen.getByLabelText("Garden draft text")).toHaveValue("Keep the flower thought");
  expect(screen.getByLabelText("Garden draft text")).toHaveFocus();
  expect(screen.queryByRole("dialog", { name: "Memories" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(await screen.findByRole("dialog", { name: "Memories" })).toBeVisible();
});

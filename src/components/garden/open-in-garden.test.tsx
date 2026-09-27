import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, MouseEvent } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const route = vi.hoisted(() => ({ pathname: "/memories", back: vi.fn(), replace: vi.fn(), push: vi.fn() }));
const api = vi.hoisted(() => ({ refreshGarden: vi.fn(), readSettings: vi.fn(), saveSetting: vi.fn(), readPrivateInteraction: vi.fn(), loadMemories: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => route }));
// A client navigation: the link changes the route after its own click handler.
vi.mock("next/link", () => ({
  default: ({ href, onClick, ...rest }: ComponentProps<"a"> & { prefetch?: boolean; scroll?: boolean }) => {
    const props: Record<string, unknown> = { ...rest };
    delete props.prefetch;
    delete props.scroll;
    return <a {...props} href={String(href)} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      event.preventDefault();
      if (!event.metaKey && !event.ctrlKey) route.pathname = new URL(String(href), "http://garden.test").pathname;
    }} />;
  },
}));
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
vi.mock("@/lib/peony/actions", () => ({ readPeony: vi.fn(), mutatePeony: vi.fn() }));
vi.mock("@/lib/garden/actions", () => ({ refreshGarden: api.refreshGarden, mutateGarden: vi.fn(), loadFlowerHistory: vi.fn() }));
vi.mock("@/lib/settings/actions", () => ({ readSettings: api.readSettings, saveSetting: api.saveSetting }));
vi.mock("@/lib/private-interaction/actions", () => ({ readPrivateInteraction: api.readPrivateInteraction, controlPrivateInteraction: vi.fn() }));
vi.mock("@/lib/memories/actions", () => ({ loadMemories: api.loadMemories }));
import { GardenStage } from "@/components/layout/garden-stage";
import { MemoriesClient } from "@/components/memories/memories-client";
import { MemberPreferences } from "@/components/settings/member-preferences";
import { SheetScope } from "@/components/ui/sheet-scope";
import { clearSpotRequest, requestSpot } from "@/lib/garden/spot-request";
import { gardenFixture } from "@/test/garden-fixture";
import { memoryFixture } from "@/test/memory-fixture";
import type { MemoryItem } from "@/lib/memories/model";

const settings = { state: { revision: 1, guide: "skipped" as const, gentle_motion: true }, error: null };
function garden() {
  const state = gardenFixture();
  const cactus = state.plants[0];
  state.plants.push({ ...cactus, flower: { ...cactus.flower, id: "00000000-0000-4000-8000-000000000002", type_key: "rose", spot: 2, is_initial: false, planted_by: 1 } });
  return state;
}
const state = garden();
function App({ items = [memoryFixture()] }: { items?: MemoryItem[] }) {
  return <MemberPreferences initial={settings}><SheetScope><GardenStage initial={{ state, error: null }}>
    {route.pathname === "/memories" && <MemoriesClient memberId={1} initial={{ items, more: false, error: null }} />}
  </GardenStage></SheetScope></MemberPreferences>;
}
beforeEach(() => {
  vi.clearAllMocks();
  route.pathname = "/memories";
  window.history.replaceState(null, "", "/memories");
  api.refreshGarden.mockResolvedValue({ state, error: null });
  api.readSettings.mockResolvedValue(settings);
  api.readPrivateInteraction.mockResolvedValue({ state: { status: "idle" }, error: null });
  api.loadMemories.mockResolvedValue({ items: [], more: false, error: null });
});
afterEach(() => {
  clearSpotRequest();
  window.history.replaceState(null, "", "/");
});

it("opens a memory's flower from the Memories panel with focus inside its sheet", async () => {
  const user = userEvent.setup();
  const view = render(<App />);
  const panel = await screen.findByRole("dialog", { name: "Memories" });
  await user.click(within(panel).getByRole("link", { name: "Open in garden: Rose, spot 2" }));
  expect(route.pathname).toBe("/garden");
  view.rerender(<App />);
  const sheet = await screen.findByRole("dialog", { name: "Rose" });
  await waitFor(() => expect(sheet).toContainElement(document.activeElement as HTMLElement));
  expect(screen.queryByRole("dialog", { name: "Memories" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rose" })).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: /^Rose, spot 2/ })).toHaveFocus();
});

it("opens a flower from a direct garden URL and then forgets the one-shot query", async () => {
  route.pathname = "/garden";
  window.history.replaceState(null, "", "/garden?spot=2");
  render(<App />);
  const sheet = await screen.findByRole("dialog", { name: "Rose" });
  await waitFor(() => expect(sheet).toContainElement(document.activeElement as HTMLElement));
  expect(window.location.pathname).toBe("/garden");
  expect(window.location.search).toBe("");
});

it("keeps the notice's live region rendered and empty before any notice text arrives", async () => {
  route.pathname = "/memories";
  const view = render(<App />);
  await screen.findByRole("dialog", { name: "Memories" });
  const region = document.querySelector<HTMLElement>('[role="status"][data-spot-notice]');
  expect(region).not.toBeNull();
  expect(region).toBeEmptyDOMElement();
  // Leaving the panel for an empty spot fills the same, already-present region.
  act(() => requestSpot({ spot: 5 }));
  route.pathname = "/garden";
  view.rerender(<App />);
  await waitFor(() => expect(region).toHaveTextContent("Spot 5 has no flower right now."));
  expect(document.querySelector('[role="status"][data-spot-notice]')).toBe(region);
});

it.each([
  ["/garden?spot=5", "Spot 5 has no flower right now."],
  ["/garden?spot=99", "That flower isn’t in your garden."],
  ["/garden?spot=oops", "That flower isn’t in your garden."],
])("explains %s instead of opening a sheet", async (url, message) => {
  const user = userEvent.setup();
  route.pathname = "/garden";
  window.history.replaceState(null, "", url);
  render(<App />);
  expect(await screen.findByText(message)).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(window.location.search).toBe("");
  await user.click(screen.getByRole("button", { name: "OK" }));
  expect(screen.queryByText(message)).not.toBeInTheDocument();
});

it("starts an empty album with a one-tap route to the Cactus", async () => {
  const user = userEvent.setup();
  const view = render(<App items={[]} />);
  const panel = await screen.findByRole("dialog", { name: "Memories" });
  expect(within(panel).getByText(/Your first memory appears once one of you shares care/)).toBeVisible();
  await user.click(within(panel).getByRole("link", { name: "Visit the Cactus" }));
  view.rerender(<App items={[]} />);
  const sheet = await screen.findByRole("dialog", { name: "Cactus" });
  await waitFor(() => expect(sheet).toContainElement(document.activeElement as HTMLElement));
});

it("does not queue a flower for a modified click that opens elsewhere", async () => {
  const user = userEvent.setup();
  const view = render(<App />);
  const panel = await screen.findByRole("dialog", { name: "Memories" });
  const link = within(panel).getByRole("link", { name: "Open in garden: Rose, spot 2" });
  expect(link).toHaveAttribute("href", "/garden?spot=2");
  await user.keyboard("{Control>}");
  await user.click(link);
  await user.keyboard("{/Control}");
  route.pathname = "/garden";
  view.rerender(<App />);
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Memories" })).not.toBeInTheDocument());
  expect(screen.queryByRole("dialog", { name: "Rose" })).not.toBeInTheDocument();
});

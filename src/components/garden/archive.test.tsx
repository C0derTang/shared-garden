vi.mock("@/lib/replies/actions", () => ({ readReplies: replies.read, saveReply: replies.save }));
vi.mock("@/lib/peony/actions", () => ({ readPeony: peony.read, mutatePeony: peony.write }));
vi.mock("@/lib/garden/actions", () => ({ loadFlowerHistory: vi.fn() }));
import { render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { entryFixture, gardenFixture } from "@/test/garden-fixture";
import type { FlowerType } from "./flower-sprite";
import type { PeonyState } from "@/lib/peony/model";
import { ArchiveProvider } from "./archive";
import { DandelionWish } from "./dandelion-wish";
import { FlowerSheet } from "./flower-sheet";
import { PeonyPanel } from "./peony-panel";
const replies = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
const peony = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
const archived = (node: ReactNode) => render(<ArchiveProvider value={true}>{node}</ArchiveProvider>);
beforeEach(() => {
  vi.clearAllMocks();
  replies.read.mockResolvedValue({ replies: [{ id: 9, entry_id: 1, author_id: 1, body: "Archived reply", created_at: "2026-09-18T17:10:00Z" }], error: null });
});
function sheet(type: FlowerType, entries = [entryFixture(), { ...entryFixture(), id: 2, author_id: 2 as const }]) {
  const state = gardenFixture();
  const plant = state.plants[0];
  plant.flower.type_key = type;
  plant.entries = entries;
  plant.member1_submitted = true;
  plant.member2_submitted = true;
  return { state, plant, item: state.catalog.find((c) => c.type_key === type)!, now: Date.parse(state.server_now), busy: false, mutate: vi.fn() };
}
it("shows no entry form, edit or Today cards for a flower whose edit window is still open", () => {
  const props = sheet("rose");
  archived(<FlowerSheet {...props} />);
  expect(screen.queryByRole("region", { name: "Today's entries" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Share|Edit your entry/ })).not.toBeInTheDocument();
  expect(screen.getByText(/no longer grows or changes/)).toBeInTheDocument();
  expect(screen.queryByText(/\+1 at 4 a\.m\./)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Read history" })).toBeEnabled();
});
it("offers no photo or voice capture on archived media flowers", () => {
  for (const type of ["sunflower", "bluebell"] as const) {
    const { container, unmount } = archived(<FlowerSheet {...sheet(type, [])} />);
    expect(container.querySelector("input[type=file]")).toBeNull();
    expect(screen.queryByRole("button", { name: /photo|record|voice/i })).not.toBeInTheDocument();
    unmount();
  }
});
it("hides the Daisy question and Hydrangea blend for today", () => {
  const daisy = sheet("daisy", []);
  daisy.plant.daisy_question = { garden_day: "2026-09-18", ordinal: 1, question_id: "q", category: "light", prompt: "A synthetic question?", assigned_at: "2026-09-18T11:00:00Z" } as never;
  const { unmount } = archived(<FlowerSheet {...daisy} />);
  expect(screen.queryByText("A synthetic question?")).not.toBeInTheDocument();
  unmount();
  const hydrangea = sheet("hydrangea", [{ ...entryFixture(), payload: { mood: "calm" } }, { ...entryFixture(), id: 2, author_id: 2 as const, payload: { mood: "calm" } }]);
  archived(<FlowerSheet {...hydrangea} />);
  expect(screen.queryByRole("img", { name: /Today's mood blend/ })).not.toBeInTheDocument();
});
it("keeps a Dandelion wish readable without the fulfil action", () => {
  const { plant } = sheet("dandelion", []);
  plant.flower.shared_wish = "A synthetic wish";
  plant.flower.first_bloom_at = "2026-09-17T11:00:00Z";
  render(<DandelionWish flower={plant.flower} memberId={1} busy={false} mutate={vi.fn()} readOnly />);
  expect(screen.getByText("A synthetic wish")).toBeVisible();
  expect(screen.getByText("The garden was archived before this wish was fulfilled.")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("lists replies but offers no reply form in the archive", async () => {
  const props = sheet("rose", []);
  archived(<FlowerSheet {...props} />);
  const { loadFlowerHistory } = await import("@/lib/garden/actions");
  vi.mocked(loadFlowerHistory).mockResolvedValue({ entries: [{ ...entryFixture(), id: 3, author_id: 2, payload: { text: "Partner note" }, edit_deadline: undefined, can_edit: false }], error: null });
  screen.getByRole("button", { name: "Read history" }).click();
  const thread = await screen.findByRole("region", { name: "Replies" });
  expect(await within(thread).findByText("Archived reply")).toBeVisible();
  expect(within(thread).queryByRole("textbox")).not.toBeInTheDocument();
  expect(within(thread).queryByRole("button", { name: /Send reply/ })).not.toBeInTheDocument();
});
it("shows Peony milestones and the plan without any action", async () => {
  const state: PeonyState = {
    server_now: "2030-09-18T18:00:00Z", garden_day: "2030-09-18", next_rollover_at: "2030-09-19T11:00:00Z", member_id: 1, stage: 1, next_milestone: 2,
    contributions: [{ id: 2, milestone: 1, author_id: 1, payload: { text: "Synthetic idea" }, original_posted_at: "2030-09-18T17:55:00Z", garden_day: "2030-09-18", can_edit: true, edit_deadline: "2030-09-18T18:25:00Z", edit_deadline_inclusive: true }],
    plan: { version: 1, activity: "Synthetic walk", starts_at: "2030-09-20T02:00:00Z", can_edit: true, can_accept: true, acceptances: [] },
    completed_milestones: [],
  };
  peony.read.mockResolvedValue({ state, error: null });
  render(<PeonyPanel flowerId="00000000-0000-4000-8000-000000000001" refreshKey="k" now={Date.parse(state.server_now)} busy={false} mutate={vi.fn()} readOnly />);
  expect(await screen.findByText("Synthetic walk")).toBeVisible();
  expect(screen.getByText("Synthetic idea")).toBeVisible();
  expect(screen.getByText("Archived before: Agree on a plan")).toBeVisible();
  await waitFor(() => expect(screen.queryByRole("button", { name: "Refresh milestones" })).not.toBeInTheDocument());
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(peony.write).not.toHaveBeenCalled();
});

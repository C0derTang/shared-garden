import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gardenFixture, entryFixture } from "@/test/garden-fixture";
const { read, history } = vi.hoisted(() => ({
  read: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@/lib/peony/actions", () => ({
  readPeony: vi.fn(),
  mutatePeony: vi.fn(),
}));
vi.mock("@/lib/garden/actions", () => ({ loadFlowerHistory: history }));
vi.mock("@/lib/media/browser", async (original) => ({
  ...(await original<typeof import("@/lib/media/browser")>()),
  mediaRequest: read,
}));
import { FlowerSheet } from "./flower-sheet";
beforeEach(() => {
  read.mockImplementation(async (_operation, body) => ({
    url: `https://example.test/${body.mediaId}`,
    durationMs: 5000,
  }));
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function props() {
  const state = gardenFixture();
  const plant = state.plants[0];
  plant.flower.type_key = "bluebell";
  plant.entries = [
    { ...entryFixture(), author_id: 2, payload: { media_id: "old-voice" } },
  ];
  return {
    state,
    plant,
    item: state.catalog.find((item) => item.type_key === "bluebell")!,
    now: Date.parse(state.server_now),
    busy: false,
    mutate: vi.fn(),
  };
}
it("lets the partner listen before contributing and reconciles replaced current/history audio", async () => {
  const p = props();
  history.mockResolvedValue({ entries: p.plant.entries, error: null });
  const { rerender } = render(<FlowerSheet {...p} />);
  expect(
    screen.getByRole("button", { name: "Record" }),
  ).toBeEnabled();
  expect(screen.queryByText("Edit your entry")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Load voice memo"));
  expect(
    await screen.findByLabelText("Shared Bluebell voice memo"),
  ).toHaveAttribute("src", "https://example.test/old-voice");
  fireEvent.click(screen.getByText("Read history"));
  const region = screen.getByRole("region", { name: "Flower history" });
  fireEvent.click(await within(region).findByText("Load voice memo"));
  await within(region).findByLabelText("Shared Bluebell voice memo");
  rerender(
    <FlowerSheet
      {...p}
      plant={{
        ...p.plant,
        entries: [
          {
            ...p.plant.entries[0],
            updated_at: "2026-09-18T17:01:00Z",
            payload: { media_id: "new-voice" },
          },
        ],
      }}
    />,
  );
  expect(screen.queryAllByLabelText("Shared Bluebell voice memo")).toHaveLength(
    0,
  );
  for (const button of screen.getAllByText("Load voice memo"))
    fireEvent.click(button);
  await waitFor(() =>
    expect(screen.getAllByLabelText("Shared Bluebell voice memo")).toHaveLength(
      2,
    ),
  );
  for (const audio of screen.getAllByLabelText("Shared Bluebell voice memo"))
    expect(audio).toHaveAttribute("src", "https://example.test/new-voice");
  expect(p.mutate).not.toHaveBeenCalled();
});
it("uses the voice replacement form only inside the original author/day window", () => {
  const p = props();
  p.plant.entries[0] = { ...p.plant.entries[0], author_id: 1 };
  const { rerender } = render(<FlowerSheet {...p} />);
  fireEvent.click(screen.getByText("Edit your entry"));
  expect(
    screen.getByRole("form", { name: "Replace your voice memo" }),
  ).toBeVisible();
  rerender(<FlowerSheet {...p} now={Date.parse("2026-09-18T17:31:00Z")} />);
  expect(screen.getByText("Save replacement memo")).toBeDisabled();
  expect(screen.getByText(/original edit window has ended/)).toBeVisible();
});

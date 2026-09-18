import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gardenFixture, entryFixture } from "@/test/garden-fixture";
const { save, request } = vi.hoisted(() => ({
  save: vi.fn(),
  request: vi.fn(),
}));
vi.mock("@/lib/media/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media/browser")>()),
  savePhoto: save,
  mediaRequest: request,
}));
import type { GardenResult } from "@/lib/garden/model";
import { MediaError } from "@/lib/media/browser";
import { PhotoForm } from "./photo-form";
beforeEach(() => {
  request.mockResolvedValue({});
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:photo");
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function props() {
  const state = gardenFixture();
  return {
    state,
    plant: state.plants[0],
    now: Date.parse(state.server_now),
    busy: false,
    mutate: vi.fn(async (command): Promise<GardenResult> => {
      await command.run(() => {});
      return { state, error: null, saved: true };
    }),
    onSaved: vi.fn(),
  };
}
function choose() {
  fireEvent.change(screen.getByLabelText("Choose photo"), {
    target: {
      files: [new File(["pixels"], "photo.png", { type: "image/png" })],
    },
  });
  fireEvent.load(screen.getByAltText("Your photo preview"));
}
it("requires local preview, submits only on review, and releases preview after save", async () => {
  const p = props();
  save.mockResolvedValue(undefined);
  render(<PhotoForm {...p} />);
  expect(screen.getByText("Share photo")).toBeDisabled();
  choose();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Share photo"));
  await waitFor(() => expect(p.onSaved).toHaveBeenCalledTimes(1));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
});
it("retains preview on rejected/ambiguous save without claiming success", async () => {
  const p = props();
  p.mutate.mockImplementation(async () => ({
    state: p.state,
    error: "Connection unavailable",
    saved: false,
  }));
  const { unmount } = render(<PhotoForm {...p} />);
  choose();
  fireEvent.click(screen.getByText("Share photo"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Connection unavailable",
  );
  expect(screen.getByAltText("Your photo preview")).toBeVisible();
  expect(p.onSaved).not.toHaveBeenCalled();
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
});
it("requires explicit review after rollover and cannot revive an expired edit", () => {
  const p = props();
  const { rerender } = render(<PhotoForm {...p} />);
  choose();
  const next = {
    ...p.state,
    garden_day: "2026-09-19",
    next_rollover_at: "2026-09-20T11:00:00Z",
  };
  rerender(<PhotoForm {...p} state={next} />);
  expect(screen.getByText("Share photo")).toBeDisabled();
  fireEvent.click(screen.getByText("Use this photo today"));
  expect(screen.getByText("Share photo")).toBeEnabled();
  rerender(<PhotoForm {...p} state={next} editing={entryFixture()} />);
  expect(screen.getByText("Save replacement photo")).toBeDisabled();
  expect(screen.queryByText("Use this photo today")).not.toBeInTheDocument();
});

it("requires a new selection after server validation rejects immutable bytes", async () => {
  const p = props();
  save.mockRejectedValue(new MediaError("invalid_photo"));
  p.mutate.mockImplementation(async (command) => {
    try {
      await command.run(() => {});
    } catch {
      /* normal garden failure result */
    }
    return { state: p.state, error: "Not saved", saved: false };
  });
  render(<PhotoForm {...p} />);
  choose();
  fireEvent.click(screen.getByText("Share photo"));
  await screen.findByRole("alert");
  expect(screen.getByText("Share photo")).toBeDisabled();
  expect(p.onSaved).not.toHaveBeenCalled();
});

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gardenFixture, entryFixture } from "@/test/garden-fixture";
import type { GardenResult } from "@/lib/garden/model";
const { save, request, recorder } = vi.hoisted(() => ({
  save: vi.fn(),
  request: vi.fn(),
  recorder: {
    phase: "review",
    file: null as File | null,
    preview: "blob:voice",
    error: null,
    elapsedMs: 5000,
    canPause: true,
    start: vi.fn(),
    stop: vi.fn(),
    discard: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  },
}));
vi.mock("@/lib/media/browser", async (original) => ({
  ...(await original<typeof import("@/lib/media/browser")>()),
  saveVoice: save,
  mediaRequest: request,
}));
vi.mock("@/lib/media/use-voice-recorder", async (original) => ({
  ...(await original<typeof import("@/lib/media/use-voice-recorder")>()),
  useVoiceRecorder: () => recorder,
}));
import { MediaError } from "@/lib/media/browser";
import { VoiceForm } from "./voice-form";
beforeEach(() => {
  recorder.phase = "review";
  recorder.file = new File(["voice"], "memo.webm", { type: "audio/webm" });
  request.mockResolvedValue({});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
it("keeps keyboard focus on an available control when pausing and returning to idle", () => {
  const p = props();
  recorder.phase = "recording";
  const { rerender } = render(<VoiceForm {...p} />);
  expect(screen.getByText("Stop and review")).toHaveFocus();
  recorder.phase = "paused";
  rerender(<VoiceForm {...p} />);
  expect(screen.getByText("Resume recording")).toHaveFocus();
  recorder.phase = "idle";
  rerender(<VoiceForm {...p} />);
  expect(screen.getByText("Record")).toHaveFocus();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
it("requires playable review and explicit share, then discards only on confirmed success", async () => {
  const p = props();
  render(<VoiceForm {...p} />);
  expect(screen.getByText("Share voice memo")).toBeDisabled();
  fireEvent.canPlay(screen.getByLabelText("Your voice memo preview"));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Share voice memo"));
  await waitFor(() => expect(p.onSaved).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0]).toBe(recorder.file);
  expect(recorder.discard).toHaveBeenCalledOnce();
});
it("retains the draft and request identity on ambiguous retry without reporting success", async () => {
  const p = props();
  save.mockRejectedValue(new Error("network"));
  p.mutate.mockImplementation(async (command) => {
    try {
      await command.run(() => {});
    } catch {
      /* expected */
    }
    return { state: p.state, error: "Not saved", saved: false };
  });
  render(<VoiceForm {...p} />);
  fireEvent.canPlay(screen.getByLabelText("Your voice memo preview"));
  fireEvent.click(screen.getByText("Share voice memo"));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("Share voice memo"));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[0][3]).toBe(save.mock.calls[1][3]);
  expect(recorder.discard).not.toHaveBeenCalled();
  expect(p.onSaved).not.toHaveBeenCalled();
});
it("requires explicit new-day review, preserves original replacement window and blocks invalid immutable audio", async () => {
  const p = props();
  const { rerender } = render(<VoiceForm {...p} />);
  fireEvent.canPlay(screen.getByLabelText("Your voice memo preview"));
  const state = {
    ...p.state,
    garden_day: "2026-09-19",
    next_rollover_at: "2026-09-20T11:00:00Z",
  };
  rerender(<VoiceForm {...p} state={state} />);
  expect(screen.getByText("Share voice memo")).toBeDisabled();
  fireEvent.click(screen.getByText("Use this memo today"));
  expect(screen.getByText("Share voice memo")).toBeEnabled();
  rerender(<VoiceForm {...p} state={state} editing={entryFixture()} />);
  expect(screen.getByText("Save replacement memo")).toBeDisabled();
  expect(screen.queryByText("Use this memo today")).not.toBeInTheDocument();
  rerender(<VoiceForm {...p} />);
  fireEvent.click(screen.getByText("Use this memo today"));
  save.mockRejectedValue(new MediaError("invalid_audio"));
  p.mutate.mockImplementation(async (command) => {
    try {
      await command.run(() => {});
    } catch {
      /* expected */
    }
    return { state: p.state, error: "Not saved", saved: false };
  });
  fireEvent.click(screen.getByText("Share voice memo"));
  expect(await screen.findByRole("alert")).toHaveTextContent("never shortened");
  expect(screen.getByText("Share voice memo")).toBeDisabled();
});
it("prevents late finalization after dismissal", async () => {
  const p = props();
  let check!: () => void;
  let finish!: () => void;
  save.mockImplementation(async (_file, _flower, _entry, _attempt, guard) => {
    check = guard;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const { unmount } = render(<VoiceForm {...p} />);
  fireEvent.canPlay(screen.getByLabelText("Your voice memo preview"));
  fireEvent.click(screen.getByText("Share voice memo"));
  await waitFor(() => expect(save).toHaveBeenCalled());
  unmount();
  expect(check).toThrow(/closed/);
  await act(async () => finish());
  expect(p.onSaved).not.toHaveBeenCalled();
});

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GardenResult } from "@/lib/garden-v2/model";
import { v2EntryFixture, v2GardenFixture } from "@/test/garden-v2-fixture";

const media = vi.hoisted(() => ({
  savePhoto: vi.fn(),
  saveVoice: vi.fn(),
  mediaRequest: vi.fn(),
  recorder: {
    phase: "idle" as string,
    file: null as File | null,
    preview: null as string | null,
    error: null as string | null,
    elapsedMs: 0,
    canPause: true,
    stream: null as MediaStream | null,
    start: vi.fn(),
    stop: vi.fn(),
    discard: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  },
}));
vi.mock("@/lib/media/browser", async (original) => ({
  ...(await original<typeof import("@/lib/media/browser")>()),
  savePhoto: media.savePhoto,
  saveVoice: media.saveVoice,
  mediaRequest: media.mediaRequest,
}));
vi.mock("@/lib/media/use-voice-recorder", async (original) => ({
  ...(await original<typeof import("@/lib/media/use-voice-recorder")>()),
  useVoiceRecorder: () => media.recorder,
}));

const { PhotoCare, VoiceCare } = await import("./media-care");

function props(type: "sunflower" | "bluebell") {
  const state = v2GardenFixture();
  const plant = state.plants[0]!;
  plant.flower.type_key = type;
  plant.entries = [];
  return {
    state,
    plant,
    now: Date.parse(state.server_now),
    busy: false,
    mutate: vi.fn(async (command): Promise<GardenResult> => {
      await (command as { run: (check: () => void) => Promise<void> }).run(() => {});
      return { state, error: null, saved: true };
    }),
    onSaved: vi.fn(),
  };
}

beforeEach(() => {
  media.mediaRequest.mockResolvedValue({});
  Object.assign(media.recorder, { phase: "idle", file: null, preview: null, error: null, elapsedMs: 0, stream: null });
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:synthetic-photo");
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("PhotoCare", () => {
  it("previews locally, then shares to the new garden with stepped progress", async () => {
    const p = props("sunflower");
    let reached!: () => void;
    const paused = new Promise<void>((resolve) => (reached = resolve));
    let release!: () => void;
    media.savePhoto.mockImplementation(async (...args: unknown[]) => {
      const onStage = args[6] as (stage: string) => void;
      onStage("reserving");
      onStage("uploading");
      reached();
      await new Promise<void>((resolve) => (release = resolve));
      onStage("checking");
    });
    render(<PhotoCare {...p} />);
    expect(media.mediaRequest).toHaveBeenCalledWith("cleanup", { garden: "v2" });
    expect(screen.getByLabelText("take a photo")).toHaveAttribute("capture", "environment");
    expect(screen.getByRole("button", { name: "share photo" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("choose a photo"), {
      target: { files: [new File(["pixels"], "synthetic.png", { type: "image/png" })] },
    });
    fireEvent.load(screen.getByAltText("Your photo preview"));
    expect(media.savePhoto).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "share photo" }));
    await act(async () => paused);
    const bar = screen.getByRole("progressbar", { name: "Sharing your photo" });
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuetext", "Photo: sending…");
    expect(screen.getByRole("status")).toHaveTextContent("sending…");
    await act(async () => release());
    await waitFor(() => expect(p.onSaved).toHaveBeenCalledOnce());
    const call = media.savePhoto.mock.calls[0]!;
    expect(call[1]).toBe(p.plant.flower.id);
    expect(call[2]).toBeUndefined();
    expect(call[5]).toBe("v2");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-photo");
  });

  it("replaces your photo within its edit window and cannot after it", () => {
    const p = props("sunflower");
    const entry = { ...v2EntryFixture(), payload: { media_id: "00000000-0000-4000-8000-00000000f001" } };
    const { rerender } = render(<PhotoCare {...p} editing={entry} onCancel={vi.fn()} />);
    expect(screen.getByRole("form", { name: "Replace your photo" })).toBeInTheDocument();
    rerender(<PhotoCare {...p} now={Date.parse("2026-11-02T17:31:00Z")} editing={entry} onCancel={vi.fn()} />);
    expect(screen.getByText(/edit window has ended/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "save new photo" })).toBeDisabled();
  });
});

describe("VoiceCare", () => {
  it("shows the clock and a level meter while recording, with focus on stop", () => {
    media.recorder.phase = "recording";
    media.recorder.elapsedMs = 12_000;
    render(<VoiceCare {...props("bluebell")} />);
    expect(screen.getByRole("status")).toHaveTextContent("recording");
    expect(screen.getByText("0:12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "stop and listen" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "pause" })).toBeInTheDocument();
  });

  it("meters the live microphone on this device and lets it go after", () => {
    const close = vi.fn(async () => {});
    const disconnect = vi.fn();
    class FakeContext {
      createAnalyser() {
        return { fftSize: 0, getFloatTimeDomainData: (data: Float32Array) => data.fill(0.2) };
      }
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect };
      }
      resume = async () => {};
      close = close;
    }
    vi.stubGlobal("AudioContext", FakeContext);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    media.recorder.phase = "recording";
    media.recorder.stream = {} as MediaStream;
    const p = props("bluebell");
    const { container, rerender } = render(<VoiceCare {...p} />);
    act(() => frames.shift()!(1000));
    const bar = container.querySelector<HTMLElement>("[data-live] i:last-child")!;
    expect(Number(bar.style.getPropertyValue("--level"))).toBeGreaterThan(0.5);
    media.recorder.phase = "paused";
    rerender(<VoiceCare {...p} />);
    expect(disconnect).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("shares a reviewed memo to the new garden", async () => {
    media.recorder.phase = "review";
    media.recorder.file = new File(["voice"], "memo.webm", { type: "audio/webm" });
    media.recorder.preview = "blob:synthetic-voice";
    media.recorder.elapsedMs = 5_000;
    media.saveVoice.mockResolvedValue(undefined);
    const p = props("bluebell");
    render(<VoiceCare {...p} />);
    expect(screen.getByRole("heading", { name: /listen back/ })).toHaveFocus();
    expect(screen.getByRole("button", { name: "share memo" })).toBeDisabled();
    fireEvent.canPlay(screen.getByLabelText("Your voice memo preview"));
    fireEvent.click(screen.getByRole("button", { name: "share memo" }));
    await waitFor(() => expect(p.onSaved).toHaveBeenCalledOnce());
    expect(media.saveVoice.mock.calls[0]![0]).toBe(media.recorder.file);
    expect(media.saveVoice.mock.calls[0]![5]).toBe("v2");
    expect(media.recorder.discard).toHaveBeenCalledOnce();
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVoiceRecorder } from "./use-voice-recorder";

class Recorder {
  static isTypeSupported = vi.fn(() => true);
  static instances: Recorder[] = [];
  state = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = "recording";
  });
  pause = vi.fn(() => {
    this.state = "paused";
  });
  resume = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["voice"], { type: this.mimeType }),
    });
    this.onstop?.();
  });
  constructor() {
    Recorder.instances.push(this);
  }
}
const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] };
const getUserMedia = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  Recorder.instances = [];
  Recorder.isTypeSupported.mockReturnValue(true);
  getUserMedia.mockResolvedValue(stream);
  vi.stubGlobal("MediaRecorder", Recorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:voice");
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("requests permission only on Record and stops exactly at five active minutes, excluding pause", async () => {
  const { result, unmount } = renderHook(useVoiceRecorder);
  expect(getUserMedia).not.toHaveBeenCalled();
  await act(() => result.current.start());
  expect(getUserMedia).toHaveBeenCalledWith({
    audio: { sampleRate: 48000, channelCount: 1 },
    video: false,
  });
  act(() => vi.advanceTimersByTime(2000));
  act(() => result.current.pause());
  act(() => vi.advanceTimersByTime(600000));
  expect(result.current.elapsedMs).toBe(2000);
  expect(Recorder.instances[0].stop).not.toHaveBeenCalled();
  act(() => result.current.resume());
  act(() => vi.advanceTimersByTime(297999));
  expect(result.current.phase).toBe("recording");
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.phase).toBe("review");
  expect(result.current.elapsedMs).toBe(300000);
  expect(result.current.file).toBeInstanceOf(File);
  expect(result.current.file?.type).toBe("audio/webm");
  expect(track.stop).toHaveBeenCalledTimes(1);
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:voice");
  expect(vi.getTimerCount()).toBe(0);
});

it("releases late permission after dismissal without starting a recorder", async () => {
  let grant!: (value: typeof stream) => void;
  getUserMedia.mockReturnValue(
    new Promise((resolve) => {
      grant = resolve;
    }),
  );
  const { result, unmount } = renderHook(useVoiceRecorder);
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.start();
  });
  unmount();
  await act(async () => {
    grant(stream);
    await pending;
  });
  expect(track.stop).toHaveBeenCalledOnce();
  expect(Recorder.instances).toHaveLength(0);
});

it("discards while requesting permission and safely accepts a later new recording", async () => {
  let grant!: (value: typeof stream) => void;
  getUserMedia.mockReturnValueOnce(
    new Promise((resolve) => {
      grant = resolve;
    }),
  );
  const { result } = renderHook(useVoiceRecorder);
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.start();
  });
  act(() => result.current.discard());
  await act(() => result.current.start());
  await act(async () => {
    grant(stream);
    await pending;
  });
  expect(Recorder.instances).toHaveLength(1);
  expect(result.current.phase).toBe("recording");
});

it("handles denied, missing and unsupported devices without empty review", async () => {
  const { result } = renderHook(useVoiceRecorder);
  getUserMedia.mockRejectedValueOnce(
    new DOMException("denied", "NotAllowedError"),
  );
  await act(() => result.current.start());
  expect(result.current.error).toMatch(/permission/);
  getUserMedia.mockRejectedValueOnce(
    new DOMException("missing", "NotFoundError"),
  );
  await act(() => result.current.start());
  expect(result.current.error).toMatch(/microphone/);
  Recorder.isTypeSupported.mockReturnValue(false);
  await act(() => result.current.start());
  expect(result.current.error).toMatch(/WebM/);
  expect(result.current.file).toBeNull();
});

it("catches constructor, start and runtime errors and frees all capture resources", async () => {
  const { result } = renderHook(useVoiceRecorder);
  vi.stubGlobal(
    "MediaRecorder",
    class extends Recorder {
      constructor() {
        super();
        throw new Error("constructor");
      }
    },
  );
  await act(() => result.current.start());
  expect(track.stop).toHaveBeenCalledTimes(1);
  vi.stubGlobal(
    "MediaRecorder",
    class extends Recorder {
      start = vi.fn(() => {
        throw new Error("start");
      });
    },
  );
  await act(() => result.current.start());
  expect(track.stop).toHaveBeenCalledTimes(2);
  vi.stubGlobal("MediaRecorder", Recorder);
  await act(() => result.current.start());
  act(() => Recorder.instances.at(-1)!.onerror?.());
  expect(track.stop).toHaveBeenCalledTimes(3);
  expect(result.current.phase).toBe("idle");
  expect(result.current.file).toBeNull();
  expect(result.current.error).toMatch(/record/);
  expect(vi.getTimerCount()).toBe(0);
});

it("releases recording on unmount and revokes discarded review URLs", async () => {
  const { result, unmount } = renderHook(useVoiceRecorder);
  await act(() => result.current.start());
  act(() => result.current.stop());
  act(() => result.current.discard());
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:voice");
  await act(() => result.current.start());
  unmount();
  expect(track.stop).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
it("does not trust a throwing support probe or empty/oversized recording output", async () => {
  const { result } = renderHook(useVoiceRecorder);
  Recorder.isTypeSupported.mockImplementationOnce(() => {
    throw new Error("codec probe");
  });
  await act(() => result.current.start());
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(result.current.error).toMatch(/WebM/);
  await act(() => result.current.start());
  act(() => Recorder.instances.at(-1)!.onstop?.());
  expect(result.current.error).toMatch(/No audio/);
  expect(result.current.file).toBeNull();
  await act(() => result.current.start());
  act(() =>
    Recorder.instances.at(-1)!.ondataavailable?.({
      data: new Blob([new Uint8Array(12 * 1024 * 1024 + 1)]),
    }),
  );
  expect(result.current.error).toMatch(/12 MiB/);
  expect(track.stop).toHaveBeenCalledTimes(2);
});

it("preserves a late-stopped recording with honest elapsed time for authoritative validation", async () => {
  let instant = 0;
  const clock = vi.spyOn(performance, "now").mockImplementation(() => instant);
  const { result } = renderHook(useVoiceRecorder);
  await act(() => result.current.start());
  instant = 305_000;
  act(() => vi.advanceTimersByTime(300_000));
  expect(result.current.phase).toBe("review");
  expect(result.current.elapsedMs).toBe(305_000);
  expect(result.current.file?.size).toBe(5);
  clock.mockRestore();
});

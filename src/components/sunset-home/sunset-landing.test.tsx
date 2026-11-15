import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SunsetLanding } from "./sunset-landing";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    fireEvent.play(this);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) { fireEvent.pause(this); });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("renders only the native login form for visitors without artwork or media", () => {
  const { container } = render(<SunsetLanding data={{ status: "visitor" }} />);
  expect(container.textContent).toBe("Log in");
  const form = screen.getByRole("button", { name: "Log in" }).closest("form");
  expect(form).toHaveAttribute("method", "post");
  expect(form).toHaveAttribute("action", "/auth/start");
  expect(container.querySelector("img, svg, iframe, audio, a")).toBeNull();
  expect(container.innerHTML).not.toMatch(/youtube|\/api\/home\/audio/);
});

it("offers one local audio panel without requesting media or any provider before play", () => {
  const { container } = render(<SunsetLanding data={{ status: "member" }} />);
  expect(screen.getAllByRole("region")).toHaveLength(1);
  expect(screen.getByRole("region").textContent).toBe("");
  expect(screen.queryByRole("heading")).toBeNull();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /Mute/ })).toBeNull();
  expect(screen.getByRole("button", { name: /Play.*愛在.*Khalil Fong/ })).toBeVisible();
  const audio = container.querySelector("audio")!;
  expect(audio).not.toHaveAttribute("src");
  expect(audio).toHaveAttribute("preload", "none");
  expect(audio).not.toHaveAttribute("autoplay");
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(container.querySelector("iframe, video")).toBeNull();
  expect(container.innerHTML).not.toMatch(/youtube|ytimg|googlevideo|spotify/);
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "old garden" })).toHaveAttribute("href", "/garden");
});

it("fetches private cues only on play and follows native time through pause, seeks, gaps and end", async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ version: 1, cues: [
    { start: 1, end: 3, text: "Synthetic dawn" }, { start: 5, end: 7, text: "Synthetic evening" },
  ] }) } as Response);
  const user = userEvent.setup();
  const { container } = render(<SunsetLanding data={{ status: "member" }} />);
  const audio = container.querySelector("audio")!;
  const lyrics = screen.getByLabelText("Synchronized lyrics");
  expect(lyrics).toBeEmptyDOMElement();
  expect(fetch).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /Play.*愛在/ }));
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledWith("/api/home/lyrics", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
  Object.defineProperty(audio, "duration", { value: 10, configurable: true });
  fireEvent.loadedMetadata(audio);
  audio.currentTime = 1.5;
  fireEvent.timeUpdate(audio);
  await waitFor(() => expect(lyrics).toHaveTextContent("Synthetic dawn"));
  fireEvent.pause(audio);
  expect(lyrics).toHaveTextContent("Synthetic dawn");
  fireEvent.change(screen.getByRole("slider"), { target: { value: "4" } });
  expect(lyrics).toBeEmptyDOMElement();
  audio.currentTime = 5.5;
  fireEvent.seeked(audio);
  expect(lyrics).toHaveTextContent("Synthetic evening");
  fireEvent.ended(audio);
  expect(lyrics).toBeEmptyDOMElement();
});

it("uses current time for delayed cues and cancels lyric work on unmount", async () => {
  let respond!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValue(new Promise((resolve) => { respond = resolve; }));
  const user = userEvent.setup();
  const { container, unmount } = render(<SunsetLanding data={{ status: "member" }} />);
  const audio = container.querySelector("audio")!;
  await user.click(screen.getByRole("button", { name: /Play.*愛在/ }));
  audio.currentTime = 6;
  fireEvent.seeked(audio);
  respond({ ok: true, json: async () => ({ version: 1, cues: [
    { start: 1, end: 3, text: "Earlier fixture" }, { start: 5, end: 7, text: "Current fixture" },
  ] }) } as Response);
  await waitFor(() => expect(screen.getByLabelText("Synchronized lyrics")).toHaveTextContent("Current fixture"));
  const options = vi.mocked(fetch).mock.calls[0][1];
  unmount();
  expect(options?.signal?.aborted).toBe(true);
});

it("keeps audio playable when optional lyrics fail", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("PRIVATE_CUE_PATH"));
  const user = userEvent.setup();
  const { container } = render(<SunsetLanding data={{ status: "member" }} />);
  await user.click(screen.getByRole("button", { name: /Play.*愛在/ }));
  expect(screen.getByRole("button", { name: /Pause.*愛在/ })).toBeVisible();
  expect(screen.getByLabelText("Synchronized lyrics")).toBeEmptyDOMElement();
  expect(screen.queryByRole("status")).toBeNull();
  expect(container.textContent).not.toContain("PRIVATE_CUE_PATH");
});

it("starts local audio on keyboard activation and supports pause, progress and seek", async () => {
  const user = userEvent.setup();
  const { container } = render(<SunsetLanding data={{ status: "member" }} />);
  const audio = container.querySelector("audio")!;
  screen.getByRole("button", { name: /Play.*愛在.*Khalil Fong/ }).focus();
  await user.keyboard("{Enter}");
  expect(audio).toHaveAttribute("src", "/api/home/audio");
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  Object.defineProperty(audio, "duration", { value: 244, configurable: true });
  fireEvent.loadedMetadata(audio);
  audio.currentTime = 7;
  fireEvent.timeUpdate(audio);
  const seek = screen.getByRole("slider", { name: "Playback position" });
  expect(seek).toHaveAttribute("max", "244");
  expect(seek).toHaveValue("7");
  expect(seek).toHaveAttribute("aria-valuetext", "0:07 of 4:04");
  fireEvent.change(seek, { target: { value: "60" } });
  expect(audio.currentTime).toBe(60);
  await user.click(screen.getByRole("button", { name: /Pause.*愛在/ }));
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: /Play.*愛在/ })).toBeVisible();
});

it("contains generic media failure inside the panel without exposing internal errors", async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error("PRIVATE_LOCAL_PATH"));
  const user = userEvent.setup();
  const { container } = render(<SunsetLanding data={{ status: "member" }} />);
  await user.click(screen.getByRole("button", { name: /Play.*愛在/ }));
  expect(screen.getByRole("status")).toHaveTextContent("The audio couldn’t load. Try again.");
  expect(container.textContent).not.toContain("PRIVATE_LOCAL_PATH");
  expect(screen.getByRole("button", { name: /Play.*愛在/ })).toBeVisible();
});

it("pauses audio and releases its source when leaving the page", async () => {
  const user = userEvent.setup();
  const { container, unmount } = render(<SunsetLanding data={{ status: "member" }} />);
  const audio = container.querySelector("audio")!;
  await user.click(screen.getByRole("button", { name: /Play.*愛在/ }));
  unmount();
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
  expect(audio).not.toHaveAttribute("src");
});

it("resumes the disk after a playing seek without a second playing event, but not after a paused seek", () => {
  const { container } = render(<SunsetLanding data={{ status: "member" }} />);
  const audio = container.querySelector("audio")!;
  const disk = container.querySelector('[class*="recordSlot"] > div')!;
  const stopped = disk.className;
  fireEvent.play(audio);
  fireEvent.playing(audio);
  const spinning = disk.className;
  expect(spinning).not.toBe(stopped);
  fireEvent.seeking(audio);
  expect(disk.className).toBe(stopped);
  Object.defineProperty(audio, "paused", { value: false, configurable: true });
  Object.defineProperty(audio, "readyState", { value: 4, configurable: true });
  fireEvent.seeked(audio);
  expect(disk.className).toBe(spinning);
  fireEvent.pause(audio);
  Object.defineProperty(audio, "paused", { value: true, configurable: true });
  fireEvent.seeking(audio);
  fireEvent.seeked(audio);
  expect(disk.className).toBe(stopped);
  fireEvent.error(audio);
  expect(disk.className).toBe(stopped);
});

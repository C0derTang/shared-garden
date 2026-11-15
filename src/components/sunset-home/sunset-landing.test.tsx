import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SunsetLanding } from "./sunset-landing";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    fireEvent.play(this);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) { fireEvent.pause(this); });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
  expect(screen.getByRole("button", { name: /Play.*愛在.*Khalil Fong/ })).toBeVisible();
  const audio = container.querySelector("audio")!;
  expect(audio).not.toHaveAttribute("src");
  expect(audio).toHaveAttribute("preload", "none");
  expect(audio).not.toHaveAttribute("autoplay");
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(container.querySelector("iframe, video")).toBeNull();
  expect(container.innerHTML).not.toMatch(/youtube|ytimg|googlevideo|spotify/);
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "old garden" })).toHaveAttribute("href", "/garden");
});

it("starts local audio on keyboard activation and supports pause, progress, seek and mute", async () => {
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
  await user.click(screen.getByRole("button", { name: "Mute audio" }));
  expect(audio.muted).toBe(true);
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

it("pauses and resumes scenery independently without starting audio", async () => {
  const user = userEvent.setup();
  const { container } = render(<SunsetLanding data={{ status: "member" }} />);
  await user.click(screen.getByRole("button", { name: "Pause scenery motion" }));
  expect(screen.getByRole("button", { name: "Resume scenery motion" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "Resume scenery motion" }));
  expect(screen.getByRole("button", { name: "Pause scenery motion" })).toHaveAttribute("aria-pressed", "false");
  expect(container.querySelector("audio")).not.toHaveAttribute("src");
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

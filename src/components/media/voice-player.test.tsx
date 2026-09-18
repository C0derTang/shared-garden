import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/media/browser", () => ({ mediaRequest: request }));
import { VoiceViewer, VoicePlayer } from "./voice-player";
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it("authorizes private playback only on demand and refreshes expired access without autoplay", async () => {
  request
    .mockResolvedValueOnce({
      url: "https://example.test/one",
      durationMs: 300000,
    })
    .mockResolvedValueOnce({
      url: "https://example.test/two",
      durationMs: 4980,
    });
  const { unmount } = render(<VoiceViewer mediaId="voice" />);
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Load voice memo"));
  const audio = await screen.findByLabelText("Shared Bluebell voice memo");
  expect(audio).toHaveAttribute("controls");
  expect(audio).not.toHaveAttribute("autoplay");
  expect(screen.getByText("Duration: 5:00")).toBeVisible();
  fireEvent.error(audio);
  fireEvent.click(screen.getByText("Reload private memo"));
  await waitFor(() =>
    expect(screen.getByLabelText("Shared Bluebell voice memo")).toHaveAttribute(
      "src",
      "https://example.test/two",
    ),
  );
  const signal = request.mock.calls[1][2];
  unmount();
  expect(signal.aborted).toBe(true);
});
it("replaces a changed source and stops the former audio without removing the new URL", () => {
  const { rerender } = render(<VoicePlayer source="blob:old" label="Memo" />);
  const old = screen.getByLabelText("Memo");
  rerender(<VoicePlayer source="blob:new" label="Memo" />);
  expect(screen.getByLabelText("Memo")).toHaveAttribute("src", "blob:new");
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
  expect(old).not.toHaveAttribute("src");
});
it("keeps a playable source when React checks effect cleanup in StrictMode", () => {
  render(
    <StrictMode>
      <VoicePlayer source="blob:strict" label="Strict memo" />
    </StrictMode>,
  );
  expect(screen.getByLabelText("Strict memo")).toHaveAttribute(
    "src",
    "blob:strict",
  );
});
it("stops other voice playback on explicit play and releases audio on unmount", () => {
  const pause = vi.mocked(HTMLMediaElement.prototype.pause);
  const { unmount } = render(
    <>
      <VoicePlayer source="blob:one" label="First memo" />
      <VoicePlayer source="blob:two" label="Second memo" />
    </>,
  );
  fireEvent.play(screen.getByLabelText("Second memo"));
  expect(pause).toHaveBeenCalledTimes(1);
  expect(pause.mock.instances[0]).toBe(screen.getByLabelText("First memo"));
  unmount();
  expect(pause).toHaveBeenCalledTimes(3);
});

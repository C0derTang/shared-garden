import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/media/browser", () => ({ mediaRequest: request }));
import { PhotoViewer } from "./photo-viewer";
it("obtains private access and lets a failed resource request a fresh URL", async () => {
  request
    .mockResolvedValueOnce({ url: "https://example.test/one" })
    .mockResolvedValueOnce({ url: "https://example.test/two" });
  const { unmount } = render(<PhotoViewer mediaId="photo" />);
  const image = await screen.findByAltText("Shared Sunflower photo");
  expect(image).toHaveAttribute("referrerPolicy", "no-referrer");
  fireEvent.error(image);
  fireEvent.click(screen.getByText("Reload private photo"));
  await waitFor(() =>
    expect(screen.getByAltText("Shared Sunflower photo")).toHaveAttribute(
      "src",
      "https://example.test/two",
    ),
  );
  const signal = request.mock.calls[1][2];
  unmount();
  expect(signal.aborted).toBe(true);
});

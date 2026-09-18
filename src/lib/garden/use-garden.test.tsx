import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { gardenFixture } from "@/test/garden-fixture";
const { read, write } = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("./actions", () => ({ refreshGarden: read, mutateGarden: write }));
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
import { useGarden } from "./use-garden";
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("refreshes at rollover without awarding client growth and removes lifecycle timers", async () => {
  vi.useFakeTimers();
  const state = gardenFixture();
  state.server_now = "2026-09-19T10:59:58Z";
  state.moonflower_open = true;
  const next = structuredClone(state);
  next.server_now = "2026-09-19T11:00:06Z";
  next.garden_day = "2026-09-19";
  next.next_rollover_at = "2026-09-20T11:00:00Z";
  next.moonflower_open = false;
  read
    .mockResolvedValueOnce({ state, error: null })
    .mockResolvedValue({ state: next, error: null });
  const { result, unmount } = renderHook(() =>
    useGarden({ state, error: null }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(7000);
  });
  expect(result.current.state?.garden_day).toBe("2026-09-19");
  expect(result.current.state?.plants[0].flower.growth_units).toBe(0);
  unmount();
  const count = read.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60000);
  expect(read).toHaveBeenCalledTimes(count);
});
it("refreshes on focus and exposes stale error while retaining a prior snapshot", async () => {
  const state = gardenFixture();
  read.mockResolvedValue({ state, error: null });
  const { result } = renderHook(() => useGarden({ state, error: null }));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  read.mockResolvedValue({ state: null, error: "Connection lost" });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(result.current.state?.plants).toHaveLength(1);
  expect(result.current.error).toBe("Connection lost");
});
it("rejects offline posting without queuing or claiming a save", async () => {
  const state = gardenFixture();
  read.mockResolvedValue({ state, error: null });
  const { result } = renderHook(() => useGarden({ state, error: null }));
  vi.spyOn(navigator, "onLine", "get").mockReturnValueOnce(false);
  let saved;
  await act(async () => {
    saved = await result.current.mutate({
      kind: "submit",
      flowerId: state.plants[0].flower.id,
      payload: {},
    });
  });
  expect(saved).toMatchObject({
    saved: false,
    error: expect.stringMatching(/Nothing has been queued/),
  });
  expect(write).not.toHaveBeenCalled();
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { gardenFixture } from "@/test/garden-fixture";
import type { GardenResult } from "./model";
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
it.each([false, true])(
  "revalidates a waiting save after a read (day advanced: %s)",
  async (advanced) => {
    const state = gardenFixture();
    const next = structuredClone(state);
    next.server_now = advanced
      ? "2026-09-19T11:00:01Z"
      : "2026-09-18T17:00:01Z";
    if (advanced) {
      next.garden_day = "2026-09-19";
      next.next_rollover_at = "2026-09-20T11:00:00Z";
    }
    let finishRead!: (value: GardenResult) => void;
    read.mockImplementation(
      () =>
        new Promise<GardenResult>((resolve) => {
          finishRead = resolve;
        }),
    );
    write.mockResolvedValue({ state: next, error: null, saved: true });
    const { result } = renderHook(() => useGarden({ state, error: null }));
    const command = {
      kind: "submit" as const,
      flowerId: state.plants[0].flower.id,
      payload: { text: "Review this draft" },
    };
    let outcome!: GardenResult;
    await act(async () => {
      const pending = result.current.mutate(command);
      expect(write).not.toHaveBeenCalled();
      read.mockResolvedValue({ state: next, error: null });
      finishRead({ state: next, error: null });
      outcome = await pending;
    });
    expect(result.current.busy).toBe(false);
    if (advanced) {
      expect(write).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({
        saved: false,
        error: expect.stringMatching(/review/i),
      });
    } else {
      expect(write).toHaveBeenCalledExactlyOnceWith(command);
      expect(outcome.saved).toBe(true);
    }
  },
);
it("rejects stale boundary writes after a failed refresh using the precise calibrated time", async () => {
  vi.useFakeTimers();
  const state = gardenFixture();
  state.server_now = "2026-09-19T10:59:59.900Z";
  state.moonflower_open = true;
  read.mockResolvedValue({ state: null, error: "Read unavailable" });
  write.mockResolvedValue({ state, error: null, saved: true });
  const { result } = renderHook(() => useGarden({ state, error: null }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150);
  });
  // No one-second UI tick has occurred; mutation still must see the boundary.
  expect(result.current.now).toBeLessThan(Date.parse(state.next_rollover_at));
  let outcome!: GardenResult;
  await act(async () => {
    outcome = await result.current.mutate({
      kind: "submit",
      flowerId: state.plants[0].flower.id,
      payload: {},
    });
  });
  expect(write).not.toHaveBeenCalled();
  expect(outcome.saved).toBe(false);
  expect(result.current.busy).toBe(false);
});
it("does not reopen a crossed boundary when a delayed pre-rollover snapshot arrives", async () => {
  vi.useFakeTimers();
  const state = gardenFixture();
  state.server_now = "2026-09-19T10:59:59.900Z";
  state.moonflower_open = true;
  const delayed = { ...state, server_now: "2026-09-19T10:59:59.950Z" };
  let finishRead!: (value: GardenResult) => void;
  read.mockImplementation(
    () =>
      new Promise<GardenResult>((resolve) => {
        finishRead = resolve;
      }),
  );
  write.mockResolvedValue({ state: delayed, saved: true, error: null });
  const { result } = renderHook(() => useGarden({ state, error: null }));
  let outcome!: GardenResult;
  await act(async () => {
    const pending = result.current.mutate({
      kind: "submit",
      flowerId: state.plants[0].flower.id,
      payload: {},
    });
    await vi.advanceTimersByTimeAsync(150);
    read.mockResolvedValue({ state: delayed, error: null });
    finishRead({ state: delayed, error: null });
    outcome = await pending;
  });
  expect(write).not.toHaveBeenCalled();
  expect(outcome.saved).toBe(false);
  expect(result.current.busy).toBe(false);
});
it("external photo work shares the mutation lock and refuses a rollover during upload", async () => {
  vi.useFakeTimers();
  const state = gardenFixture();
  state.server_now = "2026-09-19T10:59:58Z";
  state.moonflower_open = true;
  read.mockResolvedValue({ state, error: null });
  const { result } = renderHook(() => useGarden({ state, error: null }));
  let release!: () => void;
  let entered = false;
  let finalized = false;
  let outcome!: Promise<GardenResult>;
  await act(async () => {
    outcome = result.current.mutate({
      kind: "external",
      run: async (check) => {
        entered = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        check();
        finalized = true;
      },
    });
  });
  expect(entered).toBe(true);
  await act(async () => {
    expect(
      (
        await result.current.mutate({
          kind: "submit",
          flowerId: state.plants[0].flower.id,
          payload: {},
        })
      ).saved,
    ).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    release();
    expect((await outcome).saved).toBe(false);
  });
  expect(finalized).toBe(false);
  expect(write).not.toHaveBeenCalled();
});

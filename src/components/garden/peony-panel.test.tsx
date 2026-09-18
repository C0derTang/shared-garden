import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { PeonyPanel } from "./peony-panel";
import type { PeonyState } from "@/lib/peony/model";
const { read, write } = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/peony/actions", () => ({ readPeony: read, mutatePeony: write }));
const state = (): PeonyState => ({
  server_now: "2030-09-18T18:00:00Z",
  garden_day: "2030-09-18",
  next_rollover_at: "2030-09-19T11:00:00Z",
  member_id: 1,
  stage: 1,
  next_milestone: 2,
  contributions: [
    {
      id: 2,
      milestone: 1,
      author_id: 2,
      payload: { text: "Remote movie night" },
      original_posted_at: "2030-09-18T17:00:00Z",
      garden_day: "2030-09-18",
      can_edit: false,
      edit_deadline: "2030-09-18T17:30:00Z",
      edit_deadline_inclusive: true,
    },
  ],
  plan: {
    version: 1,
    activity: "Remote movie",
    starts_at: "2030-09-20T02:00:00Z",
    can_edit: true,
    can_accept: true,
    acceptances: [],
  },
  completed_milestones: [],
});
const mutate = vi.fn(async (command) => {
  try {
    await command.run(() => {});
    return { state: null, error: null, saved: true };
  } catch {
    return { state: null, error: "Save failed", saved: false };
  }
});
beforeEach(() => {
  read.mockReset().mockResolvedValue({ state: state(), error: null });
  write.mockReset();
  mutate.mockClear();
});
it("shows partner ideas before acting and accepts the displayed exact version", async () => {
  const user = userEvent.setup();
  render(
    <PeonyPanel
      flowerId="flower"
      refreshKey="a"
      now={Date.parse(state().server_now)}
      busy={false}
      mutate={mutate}
    />,
  );
  expect(await screen.findByText("Remote movie night")).toBeVisible();
  write.mockResolvedValue({ state: state(), saved: true, error: null });
  await user.click(
    screen.getByRole("button", { name: "Accept plan version 1" }),
  );
  expect(write).toHaveBeenCalledWith("flower", { kind: "accept", version: 1 });
});
it("keeps a draft and its original version when partner revises a plan", async () => {
  const user = userEvent.setup();
  const props = {
    flowerId: "flower",
    now: Date.parse(state().server_now),
    busy: false,
    mutate,
  };
  const view = render(<PeonyPanel {...props} refreshKey="a" />);
  await user.click(
    await screen.findByRole("button", { name: "Edit shared plan" }),
  );
  const input = screen.getByRole("textbox", { name: "Shared activity" });
  await user.clear(input);
  await user.type(input, "Remote cooking");
  read.mockResolvedValue({
    state: {
      ...state(),
      server_now: "2030-09-18T18:01:00Z",
      plan: { ...state().plan!, version: 2, activity: "Remote game" },
    },
    error: null,
  });
  view.rerender(<PeonyPanel {...props} refreshKey="b" />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save shared plan" }),
    ).toBeDisabled(),
  );
  expect(input).toHaveValue("Remote cooking");
  expect(screen.getByText(/changed while you were writing/i)).toBeVisible();
});
it("preserves personal text after a rejected save", async () => {
  read.mockResolvedValue({
    state: { ...state(), stage: 0, next_milestone: 1, plan: null },
    error: null,
  });
  write.mockResolvedValue({
    state: null,
    saved: false,
    error: "Edit window ended",
  });
  const user = userEvent.setup();
  render(
    <PeonyPanel
      flowerId="flower"
      refreshKey="a"
      now={Date.parse(state().server_now)}
      busy={false}
      mutate={mutate}
    />,
  );
  await user.click(
    await screen.findByRole("button", { name: "Share your idea" }),
  );
  await user.type(
    screen.getByRole("textbox", { name: "Your idea" }),
    "Keep my remote idea",
  );
  await user.click(screen.getByRole("button", { name: "Save contribution" }));
  expect(await screen.findByText("Edit window ended")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Your idea" })).toHaveValue(
    "Keep my remote idea",
  );
});

it.each([false, true])(
  "preserves all six fractional digits when activity changes: %s",
  async (changeActivity) => {
    const s = state();
    s.plan!.starts_at = "2030-09-20T02:00:42.123456+00:00";
    read.mockResolvedValue({ state: s, error: null });
    write.mockResolvedValue({ state: s, saved: true, error: null });
    const user = userEvent.setup();
    render(
      <PeonyPanel
        flowerId="flower"
        refreshKey="a"
        now={Date.parse(s.server_now)}
        busy={false}
        mutate={mutate}
      />,
    );
    await user.click(
      await screen.findByRole("button", { name: "Edit shared plan" }),
    );
    if (changeActivity)
      await user.type(
        screen.getByRole("textbox", { name: "Shared activity" }),
        " together",
      );
    await user.click(screen.getByRole("button", { name: "Save shared plan" }));
    expect(write).toHaveBeenCalledWith("flower", {
      kind: "plan",
      version: 1,
      activity: s.plan!.activity + (changeActivity ? " together" : ""),
      startsAt: "2030-09-20T02:00:42.123456+00:00",
    });
  },
);
it("keeps an expired edit draft copyable but disables saving", async () => {
  const s = state();
  s.stage = 0;
  s.next_milestone = 1;
  s.plan = null;
  s.contributions = [
    {
      ...s.contributions[0],
      author_id: 1,
      can_edit: true,
      original_posted_at: "2030-09-18T17:59:00Z",
      edit_deadline: "2030-09-18T18:29:00Z",
    },
  ];
  read.mockResolvedValue({ state: s, error: null });
  const user = userEvent.setup();
  const props = { flowerId: "flower", refreshKey: "a", busy: false, mutate };
  const view = render(<PeonyPanel {...props} now={Date.parse(s.server_now)} />);
  await user.click(
    await screen.findByRole("button", { name: "Edit your contribution" }),
  );
  await user.clear(screen.getByRole("textbox", { name: "Your idea" }));
  await user.type(
    screen.getByRole("textbox", { name: "Your idea" }),
    "Keep this expired draft",
  );
  view.rerender(
    <PeonyPanel {...props} now={Date.parse("2030-09-18T18:29:00.001Z")} />,
  );
  expect(
    screen.getByRole("button", { name: "Save contribution" }),
  ).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Your idea" })).toHaveValue(
    "Keep this expired draft",
  );
});

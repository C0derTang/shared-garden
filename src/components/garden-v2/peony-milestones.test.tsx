import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PeonyState } from "@/lib/peony/model";

const peony = vi.hoisted(() => ({ readPeonyV2: vi.fn(), mutatePeonyV2: vi.fn() }));
vi.mock("@/lib/garden-v2/peony-actions", () => peony);

const { PeonyMilestones } = await import("./peony-milestones");

const FLOWER = "00000000-0000-4000-8000-0000000000cc";
const NOW = Date.parse("2026-11-02T17:05:00Z");

function peonyState(patch: Partial<PeonyState> = {}): PeonyState {
  return {
    server_now: "2026-11-02T17:00:00Z",
    garden_day: "2026-11-02",
    next_rollover_at: "2026-11-03T12:00:00Z",
    member_id: 1,
    stage: 0,
    next_milestone: 1,
    contributions: [],
    plan: null,
    completed_milestones: [],
    ...patch,
  };
}

function mount(state: PeonyState) {
  peony.readPeonyV2.mockResolvedValue({ state, error: null });
  const mutate = vi.fn(async (command: { run: (check: () => void) => Promise<void> }) => {
    try {
      await command.run(() => {});
      return { state: null, error: null, saved: true };
    } catch {
      return { state: null, error: "Not saved", saved: false };
    }
  });
  render(<PeonyMilestones flowerId={FLOWER} refreshKey="k" now={NOW} busy={false} mutate={mutate as never} />);
  return mutate;
}

beforeEach(() => {
  peony.readPeonyV2.mockReset();
  peony.mutatePeonyV2.mockReset();
});

describe("PeonyMilestones", () => {
  it("lists the four steps in order and shares an idea through the new garden", async () => {
    const user = userEvent.setup();
    const mutate = mount(peonyState());
    expect(await screen.findByRole("listitem", { current: "step" })).toHaveTextContent("propose ideas");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Step 1: propose ideas · now",
      "Step 2: agree on a plan · after the step before",
      "Step 3: confirm your date happened · after the step before",
      "Step 4: share favorite moments · after the step before",
    ]);
    peony.mutatePeonyV2.mockResolvedValue({
      state: peonyState({
        server_now: "2026-11-02T17:06:00Z",
        contributions: [
          {
            id: 1,
            milestone: 1,
            author_id: 1,
            payload: { text: "A synthetic idea" },
            original_posted_at: "2026-11-02T17:06:00Z",
            garden_day: "2026-11-02",
            can_edit: true,
            edit_deadline: "2026-11-02T17:36:00Z",
            edit_deadline_inclusive: true,
          },
        ],
      }),
      error: null,
      saved: true,
    });
    await user.click(screen.getByRole("button", { name: "share an idea" }));
    await user.type(screen.getByRole("textbox", { name: "your idea" }), "A synthetic idea");
    await user.click(screen.getByRole("button", { name: "share" }));
    await waitFor(() => expect(peony.mutatePeonyV2).toHaveBeenCalledWith(FLOWER, { kind: "submit", milestone: 1, text: "A synthetic idea" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ kind: "external" }));
    expect(await screen.findByText("A synthetic idea")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "edit" })).toBeInTheDocument();
  });

  it("shows the plan, who accepted it, and accepts this version", async () => {
    const user = userEvent.setup();
    mount(
      peonyState({
        stage: 1,
        next_milestone: 2,
        completed_milestones: [{ milestone: 1, completed_at: "2026-11-01T18:00:00Z", garden_day: "2026-11-01" }],
        plan: {
          version: 2,
          activity: "A synthetic picnic",
          starts_at: "2026-11-07T03:00:00Z",
          can_edit: true,
          can_accept: true,
          acceptances: [{ author_id: 2, original_posted_at: "2026-11-02T16:00:00Z" }],
        },
      }),
    );
    expect(await screen.findByText("A synthetic picnic")).toBeInTheDocument();
    expect(screen.getByText("Fri, Nov 6, 7:00 PM")).toBeInTheDocument();
    const accepts = screen.getByRole("list", { name: "Who has accepted this plan" });
    expect(within(accepts).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["· you · not yet", "✿ partner accepted"]);
    expect(screen.getByText(/A change clears earlier acceptances/)).toBeInTheDocument();
    peony.mutatePeonyV2.mockResolvedValue({ state: null, error: null, saved: true });
    await user.click(screen.getByRole("button", { name: "accept this plan" }));
    await waitFor(() => expect(peony.mutatePeonyV2).toHaveBeenCalledWith(FLOWER, { kind: "accept", version: 2 }));
  });

  it("makes a plan with an exact Pacific time and asks which of a repeated hour", async () => {
    const user = userEvent.setup();
    mount(peonyState({ stage: 1, next_milestone: 2 }));
    await user.click(await screen.findByRole("button", { name: "make a plan" }));
    await user.type(screen.getByRole("textbox", { name: "what we’ll do" }), "A synthetic film night");
    const when = screen.getByLabelText("when (Pacific time)");
    await user.type(when, "2026-11-01T01:30");
    const save = screen.getByRole("button", { name: "save the plan" });
    expect(save).toBeDisabled();
    const choice = screen.getByRole("combobox", { name: /happens twice/ });
    await user.selectOptions(choice, within(choice).getAllByRole("option")[2]!);
    expect(save).toBeEnabled();
    peony.mutatePeonyV2.mockResolvedValue({ state: null, error: null, saved: true });
    await user.click(save);
    await waitFor(() =>
      expect(peony.mutatePeonyV2).toHaveBeenCalledWith(FLOWER, expect.objectContaining({ kind: "plan", version: 0, activity: "A synthetic film night" })),
    );
  });

  it("confirms the date with one tap and shows every step done when complete", async () => {
    const user = userEvent.setup();
    mount(peonyState({ stage: 2, next_milestone: 3 }));
    peony.mutatePeonyV2.mockResolvedValue({ state: null, error: null, saved: true });
    await user.click(await screen.findByRole("button", { name: "our date happened" }));
    await waitFor(() => expect(peony.mutatePeonyV2).toHaveBeenCalledWith(FLOWER, { kind: "submit", milestone: 3 }));
  });

  it("says when all four are done", async () => {
    mount(peonyState({ stage: 4, next_milestone: null }));
    expect(await screen.findByText(/All four milestones done together/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /share/ })).toBeNull();
  });
});

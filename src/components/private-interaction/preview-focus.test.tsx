import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  readPrivateInteraction: vi.fn(),
  answerPrivateInteraction: vi.fn(),
  controlPrivateInteraction: vi.fn(),
  previewPrivateInteraction: vi.fn(),
}));
vi.mock("@/lib/private-interaction/actions", () => api);
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
import { PrivateInteraction } from "./private-interaction";

const content = {
  title: "Review synthetic title",
  message: "Review synthetic message",
  choices: [{ key: "a", label: "Option A" }, { key: "b", label: "Option B" }],
};
beforeEach(() => vi.clearAllMocks());

it.each(["Escape", "Close"])(
  "returns focus to the visible owner preview opener after %s dismissal",
  async (dismissal) => {
    api.readPrivateInteraction.mockResolvedValue({
      state: { status: "owner", detail: { status: "ready", armed: true, unread: false, answer: null } },
      error: null,
    });
    api.previewPrivateInteraction.mockResolvedValue({ content, error: null });
    const user = userEvent.setup();
    render(<PrivateInteraction ownerControls />);
    const opener = await screen.findByRole("button", { name: "Preview privately" });
    await user.click(opener);
    await screen.findByRole("dialog");
    if (dismissal === "Escape") await user.keyboard("{Escape}");
    else await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    expect(api.answerPrivateInteraction).not.toHaveBeenCalled();
    expect(api.controlPrivateInteraction).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Preview — nothing will be sent");
  },
);

it.each(["Escape", "Close"])(
  "preserves recipient close/reopen focus after %s dismissal",
  async (dismissal) => {
    api.readPrivateInteraction.mockResolvedValue({ state: { status: "pending", content }, error: null });
    const user = userEvent.setup();
    render(<PrivateInteraction ownerControls={false} />);
    await screen.findByRole("dialog");
    if (dismissal === "Escape") await user.keyboard("{Escape}");
    else await user.click(screen.getByRole("button", { name: "Close" }));
    const opener = screen.getByRole("button", { name: "Open your garden moment" });
    await waitFor(() => expect(opener).toHaveFocus());
    expect(api.answerPrivateInteraction).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toHaveAccessibleName(content.title);
  },
);

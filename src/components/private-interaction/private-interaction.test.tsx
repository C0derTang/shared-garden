import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ readPrivateInteraction: vi.fn(), answerPrivateInteraction: vi.fn(), controlPrivateInteraction: vi.fn(), previewPrivateInteraction: vi.fn() }));
vi.mock("@/lib/private-interaction/actions", () => api);
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
import { PrivateInteraction } from "./private-interaction";
const content = { title: "Synthetic title", message: "<b>Synthetic private text</b>", choices: [{ key: "a", label: "Option A" }, { key: "b", label: "Option B" }] };
const result = (state: unknown) => ({ state, error: null });
beforeEach(() => { vi.clearAllMocks(); api.readPrivateInteraction.mockResolvedValue(result({ status: "pending", content })); });
it("lets the recipient close and reopen without answering, then explicitly select and save", async () => {
  const user = userEvent.setup();
  api.answerPrivateInteraction.mockResolvedValue(result({ status: "answered" }));
  render(<PrivateInteraction ownerControls={false} />);
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("<b>Synthetic private text</b>")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save my answer" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(api.answerPrivateInteraction).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Open your garden moment" }));
  await user.click(screen.getByRole("button", { name: "Option B" }));
  await user.click(screen.getByRole("button", { name: "Save my answer" }));
  expect(api.answerPrivateInteraction).toHaveBeenCalledWith("b");
  expect(await screen.findByText(/Your answer is saved/)).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("hides failed-refresh private content and never shows owner controls to recipient", async () => {
  render(<PrivateInteraction ownerControls />);
  await screen.findByRole("dialog");
  api.readPrivateInteraction.mockResolvedValue({ state: null, error: "Refresh failed" });
  fireEvent.focus(window);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByText(content.message)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Preview/ })).not.toBeInTheDocument();
});
it("owner preview choices never send a real answer", async () => {
  api.readPrivateInteraction.mockResolvedValue(result({ status: "owner", detail: { status: "ready", armed: true, unread: false, answer: null } }));
  api.previewPrivateInteraction.mockResolvedValue({ content, error: null });
  const user = userEvent.setup();
  render(<PrivateInteraction ownerControls />);
  await user.click(await screen.findByRole("button", { name: "Preview privately" }));
  expect(await screen.findByText("Preview — nothing will be sent")).toBeInTheDocument();
  expect(screen.getByText("Synthetic title")).not.toHaveClass(
    "sheet-description-hidden",
  );
  await user.click(screen.getByRole("button", { name: "Option A" }));
  expect(screen.getByText(/Preview selection only/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save my answer" })).not.toBeInTheDocument();
  expect(api.answerPrivateInteraction).not.toHaveBeenCalled();
});
it("shows and acknowledges owner unread answer on any garden page", async () => {
  const detail = { status: "answered", armed: true, unread: true, answer: { key: "b", label: "Option B", answered_at: "2026-09-18T20:00:00Z" } };
  api.readPrivateInteraction.mockResolvedValue(result({ status: "owner", detail }));
  api.controlPrivateInteraction.mockResolvedValue(result({ status: "owner", detail: { ...detail, unread: false } }));
  render(<PrivateInteraction ownerControls={false} />);
  expect(await screen.findByText("Option B")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark as read" })); });
  expect(api.controlPrivateInteraction).toHaveBeenCalledWith("acknowledge", undefined);
  expect(screen.queryByText("A new answer is here")).not.toBeInTheDocument();
});
it("never prompts an answered recipient", async () => {
  api.readPrivateInteraction.mockResolvedValue(result({ status: "answered" }));
  render(<PrivateInteraction ownerControls={false} />);
  await act(async () => {});
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Open your/ })).not.toBeInTheDocument();
});

it("does not reopen a pending response that was superseded by saving", async () => {
  let resolveRead!: (value: unknown) => void;
  api.answerPrivateInteraction.mockResolvedValue(result({ status: "answered" }));
  const user = userEvent.setup();
  render(<PrivateInteraction ownerControls={false} />);
  await screen.findByRole("dialog");
  api.readPrivateInteraction.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
  fireEvent.focus(window);
  await user.click(screen.getByRole("button", { name: "Option A" }));
  await user.click(screen.getByRole("button", { name: "Save my answer" }));
  await act(async () => { resolveRead(result({ status: "pending", content })); });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText(/Your answer is saved/)).toBeInTheDocument();
});

it("shows a decorative full-bloom collection through the sprite presentation seam", async () => {
  render(<PrivateInteraction ownerControls={false} />);
  const dialog = await screen.findByRole("dialog");
  expect(dialog.querySelectorAll('svg[data-stage="bloom"]')).toHaveLength(13);
});

it.each([
  [{ status: "ready", armed: true, unread: false, answer: null }, /Armed.*26 achievements/],
  [{ status: "ready", armed: false, unread: false, answer: null }, /Disarmed.*paused/],
  [{ status: "pending", armed: true, unread: false, answer: null }, /Pending.*armed/],
  [{ status: "pending", armed: false, unread: false, answer: null }, /Pending.*paused/],
  [{ status: "answered", armed: true, unread: false, answer: null }, /Answered.*will not repeat/],
] as const)("summarizes owner state %# accurately in the compact control", async (detail, expected) => {
  api.readPrivateInteraction.mockResolvedValue(result({ status: "owner", detail }));
  render(<PrivateInteraction ownerControls />);
  expect(await screen.findByRole("status", { name: "Delivery status" })).toHaveTextContent(expected);
});

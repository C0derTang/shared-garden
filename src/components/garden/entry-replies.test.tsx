import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const { read, save } = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/replies/actions", () => ({ readReplies: read, saveReply: save }));
import { EntryReplies } from "./entry-replies";
const reply = { id: 1, entry_id: 9, author_id: 2 as const, body: "<script>hello</script>", created_at: "2026-09-29T18:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); read.mockResolvedValue({ replies: [], error: null }); });
it("both identities can read safely, only the original author's partner can reply", async () => {
  read.mockResolvedValue({ replies: [reply], error: null });
  const { rerender } = render(<EntryReplies entryId={9} authorId={1} memberId={1} refreshKey="one" />);
  expect(await screen.findByText(reply.body)).toBeInTheDocument();
  expect(document.querySelector("script")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  rerender(<EntryReplies entryId={9} authorId={1} memberId={2} refreshKey="two" />);
  expect(screen.getByRole("textbox", { name: "Reply" })).toBeInTheDocument();
  expect(screen.getByText(/don’t count toward/)).toBeInTheDocument();
});
it("retains the exact pending message and token across an ambiguous retry, with no daily care action", async () => {
  save.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ reply, error: null });
  render(<EntryReplies entryId={9} authorId={1} memberId={2} refreshKey="one" />);
  const input = screen.getByRole("textbox", { name: "Reply" });
  fireEvent.change(input, { target: { value: "My reply" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/retry/i);
  expect(input).toHaveValue("My reply");
  expect(input).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry reply" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[0]).toEqual(save.mock.calls[1]);
  await waitFor(() => expect(input).toHaveValue(""));
  expect(await screen.findByText(reply.body)).toBeInTheDocument();
});
it("disables duplicate sends while pending and rejects blank or oversized text", async () => {
  let resolve!: (value: unknown) => void;
  save.mockReturnValue(new Promise(r => { resolve = r; }));
  render(<EntryReplies entryId={9} authorId={1} memberId={2} refreshKey="one" />);
  const input = screen.getByRole("textbox", { name: "Reply" });
  const send = screen.getByRole("button", { name: "Send reply" });
  for (const value of [" \n\t", "x".repeat(4001)]) {
    fireEvent.change(input, { target: { value } }); expect(send).toBeDisabled();
  }
  fireEvent.change(input, { target: { value: "Thanks" } });
  fireEvent.click(send); fireEvent.click(send);
  expect(save).toHaveBeenCalledTimes(1);
  expect(input).toBeDisabled();
  resolve({ reply, error: null });
  await waitFor(() => expect(input).toBeEnabled());
});
it("refreshes persisted replies without duplication and pages earlier replies in chronological order", async () => {
  const newer = { ...reply, id: 51, body: "Newest" };
  read.mockResolvedValueOnce({ replies: Array.from({ length: 50 }, (_, i) => ({ ...reply, id: i + 2, body: `Reply ${i + 2}` })), error: null });
  const { rerender } = render(<EntryReplies entryId={9} authorId={1} memberId={1} refreshKey="one" />);
  const older = await screen.findByRole("button", { name: "Earlier replies" });
  read.mockResolvedValueOnce({ replies: [reply], error: null });
  fireEvent.click(older);
  expect(await screen.findByText(reply.body)).toBeInTheDocument();
  expect(read).toHaveBeenLastCalledWith(9, 2);
  read.mockResolvedValueOnce({ replies: [newer], error: null });
  rerender(<EntryReplies entryId={9} authorId={1} memberId={1} refreshKey="two" />);
  expect(await screen.findByText("Newest")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(51);
  expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(reply.body);
});
it("keeps unseen replies reachable after a disconnected interval fills a fresh page", async () => {
  read.mockResolvedValueOnce({ replies: [reply], error: null });
  const { rerender } = render(<EntryReplies entryId={9} authorId={1} memberId={1} refreshKey="one" />);
  await screen.findByText(reply.body);
  read.mockResolvedValueOnce({ replies: Array.from({ length: 50 }, (_, i) => ({ ...reply, id: i + 52, body: `New ${i + 52}` })), error: null });
  rerender(<EntryReplies entryId={9} authorId={1} memberId={1} refreshKey="two" />);
  fireEvent.click(await screen.findByRole("button", { name: "Earlier replies" }));
  await waitFor(() => expect(read).toHaveBeenLastCalledWith(9, 52));
});
it("retains earlier pagination when sending before the initial read resolves", async () => {
  let resolveRead!: (value: unknown) => void;
  read.mockReturnValueOnce(new Promise(resolve => { resolveRead = resolve; }));
  save.mockResolvedValueOnce({ reply: { ...reply, id: 52, body: "Just sent" }, error: null });
  render(<EntryReplies entryId={9} authorId={1} memberId={2} refreshKey="one" />);
  await waitFor(() => expect(read).toHaveBeenCalled());
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Just sent" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  await screen.findByText("Reply saved.");
  resolveRead({ replies: Array.from({ length: 50 }, (_, i) => ({ ...reply, id: i + 2, body: `Reply ${i + 2}` })), error: null });
  await screen.findByText("Reply 2");
  expect(screen.getByRole("button", { name: "Earlier replies" })).toBeInTheDocument();
});
it("recovers earlier pagination after a failed first read and a successful send", async () => {
  read.mockResolvedValueOnce({ replies: [], error: "Replies unavailable" });
  save.mockResolvedValueOnce({ reply: { ...reply, id: 52, body: "Just sent" }, error: null });
  render(<EntryReplies entryId={9} authorId={1} memberId={2} refreshKey="one" />);
  await screen.findByRole("button", { name: "Reload replies" });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Just sent" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  await screen.findByText("Reply saved.");
  read.mockResolvedValueOnce({ replies: Array.from({ length: 50 }, (_, i) => ({ ...reply, id: i + 3, body: `Reply ${i + 3}` })), error: null });
  fireEvent.click(screen.getByRole("button", { name: "Reload replies" }));
  const earlier = await screen.findByRole("button", { name: "Earlier replies" });
  read.mockResolvedValueOnce({ replies: [reply], error: null });
  fireEvent.click(earlier);
  expect(await screen.findByText(reply.body)).toBeInTheDocument();
  expect(read).toHaveBeenLastCalledWith(9, 3);
  expect(screen.queryByRole("button", { name: "Earlier replies" })).toBeNull();
});
it("a newly sent reply cannot mask a disconnected gap in the last successful history page", async () => {
  read.mockResolvedValueOnce({ replies: [reply], error: null });
  save.mockResolvedValueOnce({ reply: { ...reply, id: 102, body: "Just sent" }, error: null });
  const { rerender } = render(<EntryReplies entryId={9} authorId={1} memberId={2} refreshKey="one" />);
  await screen.findByText(reply.body);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Just sent" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  await screen.findByText("Reply saved.");
  read.mockResolvedValueOnce({ replies: Array.from({ length: 50 }, (_, i) => ({ ...reply, id: i + 52, body: `Reply ${i + 52}` })), error: null });
  rerender(<EntryReplies entryId={9} authorId={1} memberId={2} refreshKey="two" />);
  const earlier = await screen.findByRole("button", { name: "Earlier replies" });
  expect(screen.getByText("Just sent")).toBeInTheDocument();
  fireEvent.click(earlier);
  await waitFor(() => expect(read).toHaveBeenLastCalledWith(9, 52));
});

import { MemberNamesProvider } from "@/components/auth/member-names";
it.each([1, 2] as const)("uses the configured opposite-slot name and keeps You for viewer %s", async memberId => {
  read.mockResolvedValue({ replies: [reply, { ...reply, id: 2, author_id: 1, body: "Another reply" }], error: null });
  const partnerName = memberId === 1 ? "Rowan" : "Avery";
  render(<MemberNamesProvider partnerName={partnerName}><EntryReplies entryId={9} authorId={1} memberId={memberId} refreshKey="one" /></MemberNamesProvider>);
  expect(await screen.findByText(partnerName)).toBeInTheDocument();
  expect(screen.getByText("You")).toBeInTheDocument();
  expect(screen.queryByText("Your partner")).toBeNull();
});

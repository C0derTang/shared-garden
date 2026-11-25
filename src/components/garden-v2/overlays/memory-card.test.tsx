import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberNamesProvider } from "@/components/auth/member-names";
import type { MemoryItem } from "@/lib/memories/model";
import { memoryFixture } from "@/test/memory-fixture";

vi.mock("@/lib/garden-v2/actions", () => ({ readRepliesV2: vi.fn(), saveReplyV2: vi.fn() }));
vi.mock("@/lib/replies/actions", () => ({ readReplies: vi.fn(), saveReply: vi.fn() }));
const { MemoryCard } = await import("./memory-card");

function daisy(question: string, askedBy: 1 | 2 | null, author: 1 | 2 = 2): MemoryItem {
  const item = memoryFixture("5");
  return {
    ...item,
    flower: { ...item.flower, type_key: "daisy" },
    entry: { author_id: author, updated_at: item.at, payload: { text: "A synthetic answer." }, question, question_asked_by: askedBy },
  };
}
const show = (item: MemoryItem) =>
  render(
    <MemberNamesProvider partnerName="Rowan">
      <MemoryCard item={item} memberId={1} onVisit={vi.fn()} />
    </MemberNamesProvider>,
  );

describe("Daisy memories (#212)", () => {
  it("shows the custom question an answer responded to, with who asked it", () => {
    show(daisy("What made you laugh today?", 1));
    const card = screen.getByRole("article", { name: "daisy" });
    expect(card).toHaveTextContent("you asked");
    expect(card).toHaveTextContent("What made you laugh today?");
    expect(card).toHaveTextContent("A synthetic answer.");
  });
  it("names the partner when they asked", () => {
    show(daisy("Which song suits today?", 2, 1));
    expect(screen.getByRole("article", { name: "daisy" })).toHaveTextContent("Rowan asked");
  });
  it("shows the daily question without an asker", () => {
    show(daisy("A synthetic daily question?", null));
    const card = screen.getByRole("article", { name: "daisy" });
    expect(card).toHaveTextContent("A synthetic daily question?");
    expect(card).not.toHaveTextContent(/asked/);
  });
});

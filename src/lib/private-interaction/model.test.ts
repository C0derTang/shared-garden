import { describe, expect, it } from "vitest";
import { parseInteraction, parsePreview } from "./model";
const content = { title: "Synthetic title", message: "Synthetic message", choices: [{ key: "a", label: "Option A" }, { key: "b", label: "Option B" }] };
describe("private interaction payloads", () => {
  it("retains only authorized fields in each state", () => {
    expect(parseInteraction({ status: "unavailable", content })).toEqual({ status: "unavailable" });
    expect(parseInteraction({ status: "answered", content })).toEqual({ status: "answered" });
    expect(parseInteraction({ status: "pending", content })).toEqual({ status: "pending", content });
  });
  it("rejects invalid choices and overlong private strings", () => {
    expect(() => parsePreview({ status: "preview", content: { ...content, choices: [content.choices[0], content.choices[0]] } })).toThrow();
    expect(() => parseInteraction({ status: "pending", content: { ...content, message: "x".repeat(4001) } })).toThrow();
    expect(() => parseInteraction({ status: "pending", content: { ...content, choices: [{ key: "bad key", label: "A" }, content.choices[1]] } })).toThrow();
  });
  it("accepts the same Unicode character bounds as private configuration", () => {
    expect(parseInteraction({ status: "pending", content: { ...content, title: "🌸".repeat(160) } }).status).toBe("pending");
  });
  it("requires a complete and consistent owner answer", () => {
    expect(() => parseInteraction({ status: "owner", detail: { status: "answered", armed: true, unread: true, answer: null } })).toThrow();
    expect(parseInteraction({ status: "owner", detail: { status: "answered", armed: true, unread: true, answer: { key: "b", label: "Option B", answered_at: "2026-09-18T20:00:00Z" } } }).status).toBe("owner");
  });
});

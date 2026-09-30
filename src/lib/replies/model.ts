export type Reply = { id: number; entry_id: number | string; author_id: 1 | 2; body: string; created_at: string };
export function validEntryId(value: unknown): value is number | string {
  return typeof value === "number"
    ? Number.isSafeInteger(value) && value > 0
    : typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807");
}
export function parseReply(value: unknown): Reply {
  if (!value || typeof value !== "object") throw Error("Invalid reply");
  const r = value as Record<string, unknown>;
  if (!Number.isSafeInteger(r.id) || !validEntryId(r.entry_id) ||
    (r.author_id !== 1 && r.author_id !== 2) || typeof r.body !== "string" ||
    typeof r.created_at !== "string" || !Number.isFinite(Date.parse(r.created_at))) throw Error("Invalid reply");
  return { id: r.id as number, entry_id: r.entry_id, author_id: r.author_id, body: r.body, created_at: r.created_at };
}

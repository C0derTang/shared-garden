"use server";
import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
import { parseReply, type Reply } from "./model";
async function client() {
  try { return (await requireMember({ unavailable: "throw" })).client; }
  catch (error) { if (error instanceof MemberAccessUnavailableError) return null; throw error; }
}
export async function readReplies(entryId: number, beforeId: number | null = null): Promise<{ replies: Reply[]; error: string | null }> {
  const db = await client();
  try {
    if (!db) throw Error("Unavailable");
    const { data, error } = await db.rpc("entry_reply_history", { p_entry_id: entryId, p_limit: 50, p_before_id: beforeId });
    if (error || !Array.isArray(data)) throw Error("Unavailable");
    return { replies: data.map(parseReply), error: null };
  } catch { return { replies: [], error: "Replies could not load. Try again when connected." }; }
}
export async function saveReply(entryId: number, body: string, requestId: string): Promise<{ reply: Reply | null; error: string | null; rejected?: boolean }> {
  const db = await client();
  try {
    if (!db) throw Error("Unavailable");
    const { data, error } = await db.rpc("reply_to_entry", { p_entry_id: entryId, p_body: body, p_request_id: requestId });
    if (error) {
      if (error.code === "22023" || error.code === "42501") return { reply: null, rejected: true, error: "This reply could not be saved. Check your access and use 1–4,000 characters on your partner’s entry." };
      throw Error("Unconfirmed");
    }
    return { reply: parseReply(data), error: null };
  } catch { return { reply: null, error: "We couldn’t confirm your reply. Retry to safely check and send the same message." }; }
}

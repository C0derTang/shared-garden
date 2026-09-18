"use server";
import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
import { parseInteraction, parsePreview, type InteractionContent, type InteractionResult } from "./model";
const unavailable = "This moment could not refresh. Please try again.";
async function access() {
  try { return await requireMember({ unavailable: "throw" }); }
  catch (error) { if (error instanceof MemberAccessUnavailableError) return null; throw error; }
}
export async function readPrivateInteraction(): Promise<InteractionResult> {
  const session = await access();
  if (!session) return { state: null, error: unavailable };
  try {
    const owner = session.member.member_role === "owner";
    const result = owner
      ? await session.client.rpc("owner_private_interaction", { p_action: "status" })
      : await session.client.rpc("current_private_interaction");
    if (result.error) throw result.error;
    return { state: parseInteraction(owner ? { status: "owner", detail: result.data } : result.data), error: null };
  } catch { return { state: null, error: unavailable }; }
}
export async function answerPrivateInteraction(answerKey: string): Promise<InteractionResult> {
  const session = await access();
  if (!session || session.member.member_role !== "member" || typeof answerKey !== "string" || !/^[a-z0-9_-]{1,48}$/.test(answerKey)) return { state: null, error: unavailable };
  try {
    const result = await session.client.rpc("answer_private_interaction", { p_answer_key: answerKey });
    if (result.error) throw result.error;
    return { state: parseInteraction(result.data), error: null };
  } catch { return { state: null, error: "Your answer was not confirmed. Refresh to check before trying again." }; }
}
export async function controlPrivateInteraction(action: "arm" | "acknowledge", armed?: boolean): Promise<InteractionResult> {
  const session = await access();
  if (!session || session.member.member_role !== "owner" || !["arm", "acknowledge"].includes(action) || (action === "arm" && typeof armed !== "boolean")) return { state: null, error: unavailable };
  try {
    const result = await session.client.rpc("owner_private_interaction", { p_action: action, ...(action === "arm" ? { p_armed: armed } : {}) });
    if (result.error) throw result.error;
    return { state: parseInteraction({ status: "owner", detail: result.data }), error: null };
  } catch { return { state: null, error: unavailable }; }
}
export async function previewPrivateInteraction(): Promise<{ content: InteractionContent | null; error: string | null }> {
  const session = await access();
  if (!session || session.member.member_role !== "owner") return { content: null, error: unavailable };
  try {
    const result = await session.client.rpc("owner_private_interaction", { p_action: "preview" });
    if (result.error) throw result.error;
    return { content: parsePreview(result.data), error: null };
  } catch { return { content: null, error: unavailable }; }
}

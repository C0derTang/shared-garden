"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
import { parseReply, validEntryId, type Reply } from "@/lib/replies/model";
import { parseEntries, parseEntryQuestion, parseGardenState, type Entry, type GardenCommand, type GardenResult } from "./model";

// Server Actions are public endpoints: every call rechecks live membership.
async function actionClient() {
  try {
    return (await requireMember({ unavailable: "throw" })).client;
  } catch (error) {
    if (error instanceof MemberAccessUnavailableError) return null;
    throw error;
  }
}
const unavailable = "Your connection to the garden is unavailable. Your draft is here; try again when connected.";
const refreshFailed = "The garden could not refresh. Check your connection and try again.";
const unconfirmed = "We could not confirm the save. Your draft is still here. Check today's entries before trying again.";

async function readState(client: SupabaseClient): Promise<GardenResult> {
  try {
    const { data, error } = await client.rpc("v2_current_garden_state");
    if (error) return { state: null, error: refreshFailed };
    return { state: parseGardenState(data), error: null };
  } catch {
    return { state: null, error: refreshFailed };
  }
}

export async function refreshGardenV2(): Promise<GardenResult> {
  const client = await actionClient();
  return client ? readState(client) : { state: null, error: unavailable };
}

/** Map known rejections to fixed wording; never echo backend messages. */
function rejection(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  if (error.code === "42501") return "Your garden access could not be verified. Sign in again.";
  if (message === "The edit window has ended")
    return "The edit window has ended. Edits must be within 30 minutes and before the 4 a.m. rollover.";
  if (/already submitted/i.test(message))
    return "This care may already be saved. Check today's entries before trying again, or use Edit when available.";
  if (/Moonflower/i.test(message)) return "Moonflower opens from 10 p.m. to 4 a.m. Pacific. Your thought is still here.";
  if (/bloomed/i.test(message)) return "This flower has bloomed and needs no more daily care. Its memories stay here.";
  if (/spot/i.test(message)) return "That spot is no longer available. The refreshed garden shows the open spots.";
  if (/dedicated workflow/i.test(message)) return "This flower's care is not available yet.";
  // Daisy questions (#212): the server never attaches an answer to a question you did not see.
  if (/question changed|question asked of you|assigned daily question/i.test(message))
    return "Your question just changed. Read it again above; your answer is still here.";
  if (/keeps its original question/i.test(message)) return "An edit answers the same question. Your draft is still here.";
  if (/question is locked/i.test(message)) return "Your partner has already answered, so today's question stays as it is.";
  if (/1 to 300 characters|question fields/i.test(message)) return "Your question needs 1 to 300 characters.";
  if (/not a garden member/i.test(message)) return "Your partner can't be asked a question right now.";
  if (error.code === "22023")
    return "That contribution could not be saved. Check the form and current care window, then try again.";
  return unconfirmed;
}

export async function mutateGardenV2(command: GardenCommand): Promise<GardenResult> {
  const client = await actionClient();
  if (!client) return { state: null, saved: false, error: unavailable };
  let saved = false;
  let error: string | null = null;
  try {
    let response;
    if (command?.kind === "plant")
      response = await client.rpc("v2_plant_flower_at", {
        p_type_key: command.type,
        p_spot: command.spot,
        p_shared_wish: command.type === "dandelion" ? (command.wish ?? "") : null,
      });
    else if (command?.kind === "submit")
      response = await client.rpc("v2_submit_flower_entry", { p_flower_id: command.flowerId, p_payload: command.payload });
    else if (command?.kind === "edit")
      response = await client.rpc("v2_edit_flower_entry", { p_entry_id: command.entryId, p_payload: command.payload });
    else if (command?.kind === "fulfillDandelion")
      response = await client.rpc("v2_fulfill_dandelion", { p_flower_id: command.flowerId });
    else if (command?.kind === "askDaisy")
      response = await client.rpc("v2_ask_daisy_question", { p_flower_id: command.flowerId, p_question: { prompt: command.prompt } });
    else if (command?.kind === "removeDaisyQuestion")
      response = await client.rpc("v2_remove_daisy_question", { p_flower_id: command.flowerId });
    else return { ...(await readState(client)), saved: false, error: "Choose a valid garden action." };
    if (response.error)
      error =
        command.kind === "fulfillDandelion"
          ? "We could not confirm fulfillment. Refresh and check this wish before trying again."
          : rejection(response.error);
    else saved = true;
  } catch {
    error = unconfirmed;
  }
  // Rejected transactions roll back settlement too. Always obtain a fresh read.
  const fresh = await readState(client);
  return {
    state: fresh.state,
    saved,
    error: error ?? (fresh.error ? "Saved, but the garden could not refresh. Refresh before adding more care." : null),
  };
}

/**
 * Attach the question each earlier Daisy answer responded to. Questions are a
 * label on top of the entries, so a failed lookup leaves the entries readable.
 */
async function withDaisyQuestions(client: SupabaseClient, entries: Entry[]): Promise<Entry[]> {
  const ids = entries.filter((entry) => entry.daisy_assignment_day).map((entry) => entry.id);
  if (!ids.length) return entries;
  try {
    const { data, error } = await client.rpc("v2_daisy_entry_questions", { p_entry_ids: ids });
    if (error || !Array.isArray(data)) return entries;
    const questions = new Map(data.map((row: { entry_id: number; question: unknown }) => [row.entry_id, parseEntryQuestion(row.question)]));
    return entries.map((entry) => (questions.has(entry.id) ? { ...entry, question: questions.get(entry.id) } : entry));
  } catch {
    return entries;
  }
}

export async function loadFlowerHistoryV2(
  flowerId: string,
  beforeId: number | null = null,
): Promise<{ entries: Entry[]; error: string | null }> {
  const client = await actionClient();
  if (!client) return { entries: [], error: unavailable };
  try {
    const { data, error } = await client.rpc("v2_entry_history", { p_flower_id: flowerId, p_limit: 20, p_before_id: beforeId });
    if (error) throw new Error("History unavailable");
    return { entries: await withDaisyQuestions(client, parseEntries(data)), error: null };
  } catch {
    return { entries: [], error: "History could not load. Try again when connected." };
  }
}

export async function readRepliesV2(
  entryId: number | string,
  beforeId: number | null = null,
): Promise<{ replies: Reply[]; error: string | null }> {
  const client = await actionClient();
  try {
    if (!client || !validEntryId(entryId)) throw Error("Unavailable");
    const { data, error } = await client.rpc("v2_entry_reply_history", { p_entry_id: entryId, p_limit: 50, p_before_id: beforeId });
    if (error || !Array.isArray(data)) throw Error("Unavailable");
    // Keep the caller's opaque parent ID; the JSON echo can round large bigints.
    return { replies: data.map((row) => parseReply({ ...row, entry_id: entryId })), error: null };
  } catch {
    return { replies: [], error: "Replies could not load. Try again when connected." };
  }
}

export async function saveReplyV2(
  entryId: number,
  body: string,
  requestId: string,
): Promise<{ reply: Reply | null; error: string | null; rejected?: boolean }> {
  const client = await actionClient();
  try {
    if (!client) throw Error("Unavailable");
    const { data, error } = await client.rpc("v2_reply_to_entry", { p_entry_id: entryId, p_body: body, p_request_id: requestId });
    if (error) {
      if (error.code === "22023" || error.code === "42501")
        return {
          reply: null,
          rejected: true,
          error: "This reply could not be saved. Check your access and use 1–4,000 characters on the other member’s entry.",
        };
      throw Error("Unconfirmed");
    }
    return { reply: parseReply(data), error: null };
  } catch {
    return { reply: null, error: "We couldn’t confirm your reply. Retry to safely check and send the same message." };
  }
}

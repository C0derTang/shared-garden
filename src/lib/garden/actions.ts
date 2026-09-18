"use server";

import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
import {
  parseGardenState,
  parseEntries,
  type GardenCommand,
  type GardenResult,
} from "./model";
import type { SupabaseClient } from "@supabase/supabase-js";

async function actionClient() {
  try {
    return (await requireMember({ unavailable: "throw" })).client;
  } catch (error) {
    if (error instanceof MemberAccessUnavailableError) return null;
    throw error;
  }
}
const unavailable =
  "Your connection to the garden is unavailable. Your draft is here; try again when connected.";

async function readState(client: SupabaseClient): Promise<GardenResult> {
  try {
    const { data, error } = await client.rpc("current_garden_state");
    if (error)
      return {
        state: null,
        error:
          "The garden could not refresh. Check your connection and try again.",
      };
    return { state: parseGardenState(data), error: null };
  } catch {
    return {
      state: null,
      error:
        "The garden could not refresh. Check your connection and try again.",
    };
  }
}
export async function refreshGarden(): Promise<GardenResult> {
  const client = await actionClient();
  return client ? readState(client) : { state: null, error: unavailable };
}
function rejection(error: { code?: string; message?: string }) {
  if (error.code === "42501")
    return "Your garden access could not be verified. Sign in again.";
  if (error.message === "The edit window has ended")
    return "The edit window has ended. Edits must be within 30 minutes and before the 4 a.m. rollover.";
  if (/already|duplicate/i.test(error.message ?? ""))
    return "This care may already be saved. Check today's entries before trying again, or use Edit when available.";
  if (/Moonflower/i.test(error.message ?? ""))
    return "Moonflower opens from 10 p.m. to 4 a.m. Pacific. Your thought is still here.";
  if (/bloom/i.test(error.message ?? ""))
    return "This flower has bloomed and needs no more daily care. Its memories stay here.";
  if (/occupied|limit|locked/i.test(error.message ?? ""))
    return "That spot or seed is no longer available. The refreshed garden shows the current choices.";
  if (error.code === "22023")
    return "That contribution could not be saved. Check the form and current care window, then try again.";
  return "We could not confirm the save. Your draft is still here. Check today's entries before trying again.";
}
export async function mutateGarden(
  command: GardenCommand,
): Promise<GardenResult> {
  // Server Actions are public endpoints: do not rely on the page or proxy guard.
  const client = await actionClient();
  if (!client) return { state: null, saved: false, error: unavailable };
  let saved = false;
  let error: string | null = null;
  try {
    let response;
    if (command?.kind === "plant")
      response = await client.rpc("plant_flower_at", {
        p_type_key: command.type,
        p_spot: command.spot,
        p_shared_wish:
          command.type === "dandelion" ? (command.wish ?? "") : null,
      });
    else if (command?.kind === "submit")
      response = await client.rpc("submit_flower_entry", {
        p_flower_id: command.flowerId,
        p_payload: command.payload,
      });
    else if (command?.kind === "edit")
      response = await client.rpc("edit_flower_entry", {
        p_entry_id: command.entryId,
        p_payload: command.payload,
      });
    else
      return {
        ...(await readState(client)),
        saved: false,
        error: "Choose a valid garden action.",
      };
    if (response.error) error = rejection(response.error);
    else saved = true;
  } catch {
    error =
      "We could not confirm the save. Your draft is still here. Check today's entries before trying again.";
  }
  // Rejected transactions roll back settlement too. Always obtain a fresh read.
  const fresh = await readState(client);
  return {
    state: fresh.state,
    saved,
    error:
      error ??
      (fresh.error
        ? "Saved, but the garden could not refresh. Refresh before adding more care."
        : null),
  };
}
export async function loadFlowerHistory(
  flowerId: string,
  beforeId: number | null = null,
) {
  const client = await actionClient();
  if (!client) return { entries: [], error: unavailable };
  try {
    const { data, error } = await client.rpc("entry_history", {
      p_flower_id: flowerId,
      p_limit: 20,
      p_before_id: beforeId,
    });
    if (error) throw new Error("History unavailable");
    return { entries: parseEntries(data), error: null };
  } catch {
    return {
      entries: [],
      error: "History could not load. Try again when connected.",
    };
  }
}

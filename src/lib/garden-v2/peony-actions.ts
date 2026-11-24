"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
// The v2 Peony state has the legacy shape; only the RPCs and tables differ.
import { parsePeonyState, type PeonyCommand, type PeonyState } from "@/lib/peony/model";

export type PeonyResultV2 = {
  state: PeonyState | null;
  error: string | null;
  saved?: boolean;
};

const unavailable = "Peony could not refresh. Your draft is here; reconnect and try again.";

// Server Actions are public endpoints: every call rechecks live membership.
async function actionClient() {
  try {
    return (await requireMember({ unavailable: "throw" })).client;
  } catch (error) {
    if (error instanceof MemberAccessUnavailableError) return null;
    throw error;
  }
}

async function read(client: SupabaseClient, flowerId: string): Promise<PeonyResultV2> {
  try {
    const { data, error } = await client.rpc("v2_current_peony_state", {
      p_flower_id: flowerId,
    });
    if (error) throw error;
    return { state: parsePeonyState(data), error: null };
  } catch {
    return { state: null, error: unavailable };
  }
}

export async function readPeonyV2(flowerId: string): Promise<PeonyResultV2> {
  const client = await actionClient();
  return client ? read(client, flowerId) : { state: null, error: unavailable };
}

export async function mutatePeonyV2(flowerId: string, command: PeonyCommand): Promise<PeonyResultV2> {
  const client = await actionClient();
  if (!client) return { state: null, error: unavailable, saved: false };
  let saved = false;
  let error: string | null = null;
  try {
    let response;
    if (command?.kind === "submit")
      response = await client.rpc("v2_submit_peony_contribution", {
        p_flower_id: flowerId,
        p_milestone: command.milestone,
        p_payload: command.milestone === 3 ? {} : { text: command.text },
      });
    else if (command?.kind === "edit")
      response = await client.rpc("v2_edit_peony_contribution", {
        p_contribution_id: command.id,
        p_payload: { text: command.text },
      });
    else if (command?.kind === "plan")
      response = await client.rpc("v2_set_peony_plan", {
        p_flower_id: flowerId,
        p_expected_version: command.version,
        p_activity: command.activity,
        p_starts_at: command.startsAt,
      });
    else if (command?.kind === "accept")
      response = await client.rpc("v2_accept_peony_plan", {
        p_flower_id: flowerId,
        p_plan_version: command.version,
      });
    else throw new Error("Invalid action");
    if (response.error)
      error =
        response.error.code === "42501"
          ? "Your garden access could not be verified. Sign in again."
          : "This step changed or its edit window ended. Your draft is here. Review the refreshed milestone and plan before trying again.";
    else saved = true;
  } catch {
    error = "We could not confirm the save. Your draft is here. Refresh and check the milestone before trying again.";
  }
  // Rejected transactions roll back settlement too. Always obtain a fresh read.
  const fresh = await read(client, flowerId);
  return { state: fresh.state, saved, error: error ?? fresh.error };
}

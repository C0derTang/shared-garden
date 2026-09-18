import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Member =
  | { member_id: 1; member_role: "owner" }
  | { member_id: 2; member_role: "member" };
export type Access =
  | { status: "allowed"; member: Member }
  | { status: "signin" | "denied" | "unavailable" };

export async function verifyMember(client: SupabaseClient): Promise<Access> {
  try {
    // getSession() and editable user metadata are never authorization evidence.
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return { status: "signin" };
    const { data: rows, error: membershipError } =
      await client.rpc("current_member");
    if (membershipError) return { status: "unavailable" };
    if (!Array.isArray(rows) || rows.length !== 1) return { status: "denied" };
    const member = rows[0];
    if (
      !member ||
      !(
        (member.member_id === 1 && member.member_role === "owner") ||
        (member.member_id === 2 && member.member_role === "member")
      )
    )
      return { status: "denied" };
    // Return only the safe membership contract; no Auth profile or token reaches UI.
    return {
      status: "allowed",
      member: {
        member_id: member.member_id,
        member_role: member.member_role,
      } as Member,
    };
  } catch {
    return { status: "unavailable" };
  }
}

import "server-only";

/** Presentation only. Call after requireMember; never use names for identity. */
export function partnerDisplayName(memberId: 1 | 2): string | null {
  const raw = memberId === 1 ? process.env.GARDEN_MEMBER_2_NAME : process.env.GARDEN_MEMBER_1_NAME;
  if (!raw) return null;
  // Only plain human-name characters; reject controls even at the trimmed edges.
  if (!/^[\p{L}\p{M} .’'-]+$/u.test(raw)) return null;
  const name = raw.trim();
  return name.length > 0 && name.length <= 60 && /\p{L}/u.test(name) ? name : null;
}

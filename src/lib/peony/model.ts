export type Contribution = {
  id: number;
  milestone: number;
  author_id: 1 | 2;
  payload: { text?: string };
  original_posted_at: string;
  garden_day: string;
  can_edit: boolean;
  edit_deadline: string;
  edit_deadline_inclusive: boolean;
};
export type PeonyState = {
  server_now: string;
  garden_day: string;
  next_rollover_at: string;
  member_id: 1 | 2;
  stage: number;
  next_milestone: number | null;
  contributions: Contribution[];
  plan: null | {
    version: number;
    activity: string;
    starts_at: string;
    can_edit: boolean;
    can_accept: boolean;
    acceptances: { author_id: 1 | 2; original_posted_at: string }[];
  };
  completed_milestones: {
    milestone: number;
    completed_at: string;
    garden_day: string;
  }[];
};
export type PeonyCommand =
  | { kind: "submit"; milestone: number; text?: string }
  | { kind: "edit"; id: number; text: string }
  | { kind: "plan"; version: number; activity: string; startsAt: string }
  | { kind: "accept"; version: number };
export function canEditContribution(
  entry: Pick<
    Contribution,
    "can_edit" | "edit_deadline" | "edit_deadline_inclusive"
  >,
  now: number,
) {
  const end = Date.parse(entry.edit_deadline);
  return (
    entry.can_edit && (entry.edit_deadline_inclusive ? now <= end : now < end)
  );
}
const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function pacificLocal(instant: string) {
  const p = Object.fromEntries(
    parts.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function pacificCandidates(local: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return [];
  // Pacific's two modern offsets, checked by round-trip so gaps and invalid
  // calendar dates never get silently normalized by the browser.
  return ["-07:00", "-08:00"]
    .map((offset) => new Date(`${local}:00${offset}`))
    .filter(
      (d) =>
        Number.isFinite(d.getTime()) && pacificLocal(d.toISOString()) === local,
    )
    .map((d) => d.toISOString());
}
export function pacificDate(instant: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "long",
  }).format(new Date(instant));
}
export function parsePeonyState(value: unknown): PeonyState {
  const s = value as PeonyState;
  const time = (v: unknown) =>
    typeof v === "string" && Number.isFinite(Date.parse(v));
  if (
    !s ||
    !time(s.server_now) ||
    !time(s.next_rollover_at) ||
    typeof s.garden_day !== "string" ||
    ![1, 2].includes(s.member_id) ||
    !Number.isInteger(s.stage) ||
    s.stage < 0 ||
    s.stage > 4 ||
    s.next_milestone !== (s.stage === 4 ? null : s.stage + 1) ||
    !Array.isArray(s.contributions) ||
    !Array.isArray(s.completed_milestones)
  )
    throw Error("Invalid Peony response");
  for (const c of s.contributions)
    if (
      !Number.isSafeInteger(c.id) ||
      ![1, 3, 4].includes(c.milestone) ||
      ![1, 2].includes(c.author_id) ||
      !time(c.original_posted_at) ||
      !time(c.edit_deadline) ||
      typeof c.can_edit !== "boolean" ||
      typeof c.edit_deadline_inclusive !== "boolean" ||
      !c.payload ||
      (c.milestone !== 3 && typeof c.payload.text !== "string")
    )
      throw Error("Invalid Peony contribution");
  if (
    s.plan &&
    (!Number.isSafeInteger(s.plan.version) ||
      s.plan.version < 1 ||
      typeof s.plan.activity !== "string" ||
      !time(s.plan.starts_at) ||
      typeof s.plan.can_edit !== "boolean" ||
      typeof s.plan.can_accept !== "boolean" ||
      !Array.isArray(s.plan.acceptances) ||
      s.plan.acceptances.some(
        (a) => ![1, 2].includes(a.author_id) || !time(a.original_posted_at),
      ))
  )
    throw Error("Invalid Peony plan");
  for (const c of s.completed_milestones)
    if (
      ![1, 2, 3, 4].includes(c.milestone) ||
      !time(c.completed_at) ||
      typeof c.garden_day !== "string"
    )
      throw Error("Invalid Peony history");
  return s;
}

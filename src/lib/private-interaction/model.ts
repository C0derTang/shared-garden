export type InteractionContent = { title: string; message: string; choices: { key: string; label: string }[] };
export type OwnerDetail = {
  status: "unconfigured" | "ready" | "pending" | "answered";
  armed: boolean;
  unread: boolean;
  answer: { key: string; label: string; answered_at: string } | null;
};
export type InteractionState =
  | { status: "unavailable" | "answered" }
  | { status: "pending"; content: InteractionContent }
  | { status: "owner"; detail: OwnerDetail };
export type InteractionResult = { state: InteractionState | null; error: string | null };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid interaction");
  return value as Record<string, unknown>;
};
const bounded = (value: unknown, max: number): string => {
  if (typeof value !== "string" || !value.trim() || [...value].length > max) throw Error("Invalid interaction text");
  return value;
};
const key = (value: unknown) => {
  const text = bounded(value, 48);
  if (!/^[a-z0-9_-]+$/.test(text)) throw Error("Invalid answer key");
  return text;
};
function content(value: unknown): InteractionContent {
  const item = record(value);
  if (!Array.isArray(item.choices) || item.choices.length < 2 || item.choices.length > 6) throw Error("Invalid choices");
  const choices = item.choices.map((choice) => {
    const c = record(choice);
    return { key: key(c.key), label: bounded(c.label, 120) };
  });
  if (new Set(choices.map((c) => c.key)).size !== choices.length) throw Error("Duplicate choices");
  return { title: bounded(item.title, 160), message: bounded(item.message, 4000), choices };
}
export function parsePreview(value: unknown): InteractionContent {
  const item = record(value);
  if (item.status !== "preview") throw Error("Preview unavailable");
  return content(item.content);
}
export function parseInteraction(value: unknown): InteractionState {
  const item = record(value);
  if (item.status === "unavailable" || item.status === "answered") return { status: item.status };
  if (item.status === "pending") return { status: "pending", content: content(item.content) };
  if (item.status !== "owner") throw Error("Invalid interaction state");
  const detail = record(item.detail);
  if (!["unconfigured", "ready", "pending", "answered"].includes(String(detail.status)) || typeof detail.armed !== "boolean" || typeof detail.unread !== "boolean") throw Error("Invalid owner state");
  let answer: OwnerDetail["answer"] = null;
  if (detail.answer !== null) {
    const a = record(detail.answer);
    const answered_at = bounded(a.answered_at, 64);
    if (!Number.isFinite(Date.parse(answered_at))) throw Error("Invalid answer time");
    answer = { key: key(a.key), label: bounded(a.label, 120), answered_at };
  }
  if ((detail.status === "answered") !== (answer !== null) || (detail.unread && !answer)) throw Error("Inconsistent answer");
  return { status: "owner", detail: { status: detail.status as OwnerDetail["status"], armed: detail.armed, unread: detail.unread, answer } };
}

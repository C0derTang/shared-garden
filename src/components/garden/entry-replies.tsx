"use client";
import { usePartnerName } from "@/components/auth/member-names";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { readReplies, saveReply } from "@/lib/replies/actions";
import type { Reply } from "@/lib/replies/model";
import { pacificTime } from "@/lib/garden/model";
import styles from "./entry-replies.module.css";

function combine(old: Reply[], rows: Reply[]) {
  return [...new Map([...old, ...rows].map(row => [row.id, row])).values()].sort((a, b) => a.id - b.id);
}

export function EntryReplies({ entryId, authorId, memberId, refreshKey, readOnly = false }: {
  entryId: number | string; authorId: number; memberId: number; refreshKey: string; readOnly?: boolean;
}) {
  const partnerName = usePartnerName();
  const inputId = useId();
  const [page, setPage] = useState<{
    replies: Reply[];
    more: boolean;
    historyNewestId: number | null;
    beforeId: number | null;
  }>({ replies: [], more: false, historyNewestId: null, beforeId: null });
  const { replies, more } = page;
  const [readError, setReadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const request = useRef<{ body: string; id: string } | null>(null);
  const sending = useRef(false);
  const reading = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const merge = useCallback((rows: Reply[]) => {
    setPage(old => ({ ...old, replies: combine(old.replies, rows) }));
  }, []);
  const load = useCallback(async (beforeId: number | null = null) => {
    if (beforeId !== null && reading.current) return;
    reading.current = true;
    const token = ++generation.current;
    setLoading(true);
    try {
      const result = await readReplies(entryId, beforeId);
      if (!mounted.current || token !== generation.current) return;
      setReadError(result.error);
      if (!result.error) {
        setPage(old => {
          const rows = result.replies;
          // Only successful reads establish a history range. A local send may
          // arrive before the first read, or beyond an unseen disconnected gap.
          const firstHistory = old.historyNewestId === null;
          const gap = beforeId === null && rows.length === 50 &&
            (firstHistory || old.historyNewestId! < rows[0].id);
          const resetCursor = beforeId !== null || firstHistory || gap;
          return {
            replies: gap
              ? combine(rows, old.replies.filter(reply => reply.id > rows.at(-1)!.id))
              : combine(old.replies, rows),
            more: resetCursor ? rows.length === 50 : old.more,
            historyNewestId: beforeId === null
              ? rows.at(-1)?.id ?? old.historyNewestId : old.historyNewestId,
            beforeId: resetCursor ? rows[0]?.id ?? old.beforeId : old.beforeId,
          };
        });
      }
    } catch {
      if (mounted.current && token === generation.current) setReadError("Replies could not load. Try again when connected.");
    } finally {
      if (token === generation.current) {
        reading.current = false;
        if (mounted.current) setLoading(false);
      }
    }
  }, [entryId]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, refreshKey]);
  async function send() {
    if (readOnly || typeof entryId !== "number" || sending.current || !text.trim() || Array.from(text.trim()).length > 4000) return;
    sending.current = true;
    setPending(true); setError(null); setSaved(false);
    request.current ??= { body: text.trim(), id: crypto.randomUUID() };
    try {
      const result = await saveReply(entryId, request.current.body, request.current.id);
      if (!mounted.current) return;
      if (result.reply) {
        merge([result.reply]); setText(""); setSaved(true); setRetry(false); request.current = null;
      } else {
        setError(result.error); setRetry(!result.rejected);
        if (result.rejected) request.current = null;
      }
    } catch {
      if (mounted.current) {
        setError("We couldn’t confirm your reply. Retry to safely check and send the same message.");
        setRetry(true);
      }
    } finally {
      sending.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return <section className={styles.thread} aria-label="Replies" aria-busy={loading}>
    <h5>Replies</h5>
    {more && <button type="button" className="button button-secondary" disabled={loading} onClick={() => void load(page.beforeId)}>Earlier replies</button>}
    {replies.length > 0 && <ol className={styles.messages}>{replies.map(reply => <li key={reply.id}>
      <div className={styles.meta}><strong>{reply.author_id === memberId ? "You" : partnerName.subject}</strong>{" · "}<time dateTime={reply.created_at}>{new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "short", day: "numeric" }).format(new Date(reply.created_at))} · {pacificTime(reply.created_at)}</time></div>
      <p>{reply.body}</p>
    </li>)}</ol>}
    {readOnly && loading && <p role="status">Loading replies…</p>}
    {readOnly && !loading && !readError && replies.length === 0 && <p>No replies yet.</p>}
    {readError && <div><p role="alert">{readError}</p><button type="button" className="button button-secondary" disabled={loading} onClick={() => void load()}>Reload replies</button></div>}
    {!readOnly && authorId !== memberId && <form className={styles.form} onSubmit={event => { event.preventDefault(); void send(); }}>
      <label htmlFor={inputId}>Reply</label>
      <textarea id={inputId} rows={2} value={text} disabled={pending || retry} onChange={event => { setText(event.target.value); setSaved(false); }} aria-describedby={`${inputId}-hint`} />
      <small id={`${inputId}-hint`}>Replies don’t count toward daily responses or growth. Up to 4,000 characters.</small>
      <button type="submit" className="button button-secondary" disabled={pending || !text.trim() || Array.from(text.trim()).length > 4000}>{pending ? "Sending reply…" : retry ? "Retry reply" : "Send reply"}</button>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Reply saved.</p>}
    </form>}
  </section>;
}

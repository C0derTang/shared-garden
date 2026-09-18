"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pacificTime } from "@/lib/garden/model";
import { loadSongs } from "@/lib/music/collection-actions";
import {
  mergeSongs,
  SONG_PAGE_SIZE,
  type SongPage,
  type SongQuery,
} from "@/lib/music/collection";
import { SongPlayer } from "./song-player";
import styles from "./song-collection.module.css";

export function SongCollection({
  initial,
  memberId,
}: {
  initial: SongPage;
  memberId: 1 | 2;
}) {
  const [entries, setEntries] = useState(initial.entries);
  const [more, setMore] = useState(initial.more);
  const [oldest, setOldest] = useState(initial.entries.at(-1)?.id ?? null);
  const [error, setError] = useState(initial.error);
  const [ready, setReady] = useState(!initial.error);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);

  async function read(query: SongQuery) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await loadSongs(query);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEntries((old) => mergeSongs(old, result.entries));
      setReady(true);
      if (query.kind === "latest" || query.kind === "older") {
        setMore(result.more);
        if (result.entries.length) setOldest(result.entries.at(-1)!.id);
      }
      if (query.kind === "newer")
        setNotice(
          result.more
            ? "New songs added. Check again for more."
            : result.entries.length
              ? "New songs added."
              : "You’re up to date.",
        );
    } catch {
      setError("Songs could not load. Try again when connected.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const refreshSaved = useCallback(async () => {
    if (lock.current || !entries.length) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      // Each request is bounded, even after browsing a long collection.
      // Preserve every loaded row and player; only replace returned entry IDs.
      for (let offset = 0; offset < entries.length; offset += SONG_PAGE_SIZE) {
        const result = await loadSongs({
          kind: "updates",
          ids: entries.slice(offset, offset + SONG_PAGE_SIZE).map((e) => e.id),
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        setEntries((old) => mergeSongs(old, result.entries));
      }
      setNotice("Saved songs refreshed.");
    } catch {
      setError("Songs could not refresh. Try again when connected.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [entries]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void refreshSaved();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshSaved]);

  return (
    <section className={styles.collection} aria-label="Shared song collection">
      <Link href="/garden">← Back to our garden</Link>
      <div>
        <span className="eyebrow">OUR TULIP SONGS</span>
        <h1>Our song collection</h1>
        <p>
          Both of our contributions, across every Tulip and permanent bloom.
          Repeated songs stay part of our story.
        </p>
        <p className={styles.quiet}>
          Listening is optional and never changes growth. Preview or full
          playback depends on the provider; every song keeps its original link.
        </p>
      </div>
      <div className={styles.controls}>
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={() =>
            void read(
              entries.length
                ? { kind: "newer", id: entries[0].id }
                : { kind: "latest" },
            )
          }
        >
          {ready ? "Check for newer songs" : "Try again"}
        </button>
        {!!entries.length && (
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => void refreshSaved()}
          >
            Refresh saved songs
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <p role="status" className={styles.quiet}>
        {busy ? "Loading songs…" : notice}
      </p>
      {ready && !entries.length && (
        <p>No songs yet. Share a song with a Tulip in your garden to begin.</p>
      )}
      <ol className={styles.songs}>
        {entries.map((entry) => (
          <li key={entry.id} className={styles.entry}>
            <div className={styles.meta}>
              <strong>
                {entry.author_id === memberId ? "You" : "Your partner"}
              </strong>
              <time dateTime={entry.original_posted_at}>
                {entry.garden_day} · {pacificTime(entry.original_posted_at)}
              </time>
            </div>
            <SongPlayer
              title={entry.payload.title}
              artist={entry.payload.artist}
              url={entry.payload.url}
            />
          </li>
        ))}
      </ol>
      {more && oldest !== null && (
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={() => void read({ kind: "older", id: oldest })}
        >
          Older songs
        </button>
      )}
      <p className={styles.quiet}>
        Original posting times stay the same after edits. To edit your current
        song within its allowed window, open its Tulip in the garden.
      </p>
    </section>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import type { SpotifyPage, SpotifyTrack } from "@/lib/music/spotify-types";
import styles from "./spotify-picker.module.css";

const fallback =
  "Spotify search is unavailable. Try again later, or enter your song manually below.";
export function SpotifyPicker({
  onChoose,
}: {
  onChoose: (track: SpotifyTrack) => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SpotifyPage | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(false);
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      sequence.current++;
      active.current?.abort();
    },
    [],
  );
  function clear() {
    sequence.current++;
    active.current?.abort();
    setLoading(false);
    setResult(null);
    setError(null);
    setSelected(false);
  }
  async function search(nextPage = 0) {
    const q = query.trim();
    if (loading || Array.from(q).length < 2 || Array.from(q).length > 100)
      return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const current = ++sequence.current;
    setLoading(true);
    setResult(null);
    setError(null);
    setSelected(false);
    setPage(nextPage);
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(
        `/api/music/search?${new URLSearchParams({ q, page: String(nextPage) })}`,
        { cache: "no-store", signal: controller.signal },
      );
      const body = await response.json();
      if (current !== sequence.current) return;
      if (!response.ok) {
        setError(
          body.error === "unconfigured"
            ? "Spotify search is not set up yet. You can enter your song manually below."
            : body.error === "rate_limited"
              ? "Spotify search needs a break. Try again later, or enter your song manually below."
              : fallback,
        );
        return;
      }
      if (
        !body ||
        !Array.isArray(body.tracks) ||
        typeof body.more !== "boolean"
      )
        throw new Error("Invalid search response");
      setResult(body);
    } catch {
      if (current === sequence.current) setError(fallback);
    } finally {
      clearTimeout(timeout);
      if (current === sequence.current) setLoading(false);
    }
  }
  return (
    <section className={styles.picker} aria-label="Find a song on Spotify">
      <a
        className={styles.attribution}
        href="https://open.spotify.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        {/* Official unmodified monochrome icon; provider artwork also bypasses image transforms. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/spotify-icon.svg" width="24" height="24" alt="" />
        <span>Search Spotify</span>
      </a>
      <label className={styles.field}>
        Song or artist
        <input
          ref={input}
          type="search"
          value={query}
          maxLength={200}
          placeholder="Find a song for today"
          onChange={(event) => {
            clear();
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              void search();
            }
          }}
        />
      </label>
      <div className={styles.actions}>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => void search()}
          disabled={
            loading ||
            Array.from(query.trim()).length < 2 ||
            Array.from(query.trim()).length > 100
          }
        >
          Search Spotify
        </button>
        {(loading || result || error) && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              clear();
              input.current?.focus();
            }}
          >
            Cancel search
          </button>
        )}
      </div>
      <p className={styles.hint}>
        US catalog · Choose a result, then review before sharing. Or enter a
        song manually below.
      </p>
      <div role="status" aria-live="polite">
        {loading && <p>Searching Spotify…</p>}
        {selected && (
          <p>Song selected. Review the details below before sharing.</p>
        )}
        {result && (
          <p>
            {result.tracks.length
              ? `Search results · page ${page + 1} of up to 5`
              : "No songs found. Try another song or artist, or enter the details below."}
          </p>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {result && result.tracks.length > 0 && (
        <>
          <ul className={styles.results}>
            {result.tracks.map((track) => (
              <li key={track.id} className={styles.result}>
                <a
                  className={styles.metadata}
                  href={track.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {track.image && (
                    <span className={styles.art}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={track.image}
                        width="64"
                        height="64"
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </span>
                  )}
                  <span>
                    <strong>{track.title}</strong>
                    <span>{track.artist}</span>
                    <span className={styles.album}>{track.album}</span>
                    <span className={styles.open}>Open Spotify ↗</span>
                  </span>
                </a>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={!track.selectable}
                  aria-label={
                    track.selectable
                      ? `Choose ${track.title}`
                      : `Cannot choose ${track.title}`
                  }
                  onClick={() => {
                    clear();
                    setSelected(true);
                    onChoose(track);
                  }}
                >
                  Choose song
                </button>
                {!track.selectable && (
                  <p className={styles.hint}>
                    This title or artist is longer than the 200-character entry
                    limit. Open Spotify or enter your own details manually
                    below.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            {page > 0 && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void search(page - 1)}
              >
                Previous results
              </button>
            )}
            {result.more && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void search(page + 1)}
              >
                Next results
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

"use client";
import { useState } from "react";
import { usePartnerName } from "@/components/auth/member-names";
import { SongPlayer } from "@/components/music/song-player";
import { gardenDayLabel } from "@/lib/garden-v2/flowers";
import { v2MemorySource } from "@/lib/garden-v2/memory-source";
import type { MemoryFilters } from "@/lib/memories/model";
import { useMemories } from "@/lib/memories/use-memories";
import v2 from "../garden-v2.module.css";
import { FeedControls } from "./memories-view";
import { pacificTime } from "@/lib/garden/model";
import styles from "./overlays.module.css";

const tulips: MemoryFilters = { type: "tulip" };

/**
 * Our songs: every song either of us shared with a new-garden Tulip, newest
 * first, repeats kept. Each plays through the shared `SongPlayer`, which only
 * embeds an exactly parsed Spotify track and otherwise offers the original
 * safe https link (decisions 0014 and 0024).
 */
export function SongsView({ memberId, onVisit }: { memberId: 1 | 2; onVisit: (flowerId: string) => void }) {
  const partner = usePartnerName();
  const [filters] = useState(tulips);
  const feed = useMemories(undefined, filters, v2MemorySource);
  const songs = feed.items.filter((item) => item.kind === "entry" && item.entry);
  return (
    <div className={styles.stack}>
      <FeedControls feed={feed} noun="songs" />
      {feed.ready && !songs.length && !feed.error && (
        <p className={styles.empty}>No songs yet. Share one with a tulip and it will start our record.</p>
      )}
      <ol className={styles.songs}>
        {songs.map((item, index) => {
          const entry = item.entry!;
          const you = entry.author_id === memberId;
          return (
            <li key={item.key} className={styles.song}>
              <span className={styles.record} aria-hidden="true">
                <span>{String(index + 1).padStart(2, "0")}</span>
              </span>
              <div className={styles.songBody}>
                <p className={styles.songMeta}>
                  <span className={styles.who} data-who={you ? "you" : "partner"}>
                    {you ? "you" : partner.short}
                  </span>
                  <span className={styles.meta}>
                    {gardenDayLabel(item.garden_day)} · <time dateTime={item.at}>{pacificTime(item.at)}</time>
                  </span>
                  <a
                    className={styles.visit}
                    href={`/garden?flower=${encodeURIComponent(item.flower.id)}`}
                    aria-label="Visit its tulip in the garden"
                    onClick={(event) => {
                      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      onVisit(item.flower.id);
                    }}
                  >
                    tulip ↗
                  </a>
                </p>
                <SongPlayer title={entry.payload.title ?? ""} artist={entry.payload.artist ?? ""} url={entry.payload.url ?? ""} />
              </div>
            </li>
          );
        })}
      </ol>
      {feed.more && feed.oldest && (
        <button type="button" className={v2.secondary} disabled={feed.busy} onClick={feed.older}>
          older songs
        </button>
      )}
      <p className={styles.footnote}>
        Listening is optional and never changes growth. Previews or full songs depend on the provider; every song keeps its
        original link. To change today’s song, visit its tulip.
      </p>
    </div>
  );
}

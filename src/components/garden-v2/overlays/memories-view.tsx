"use client";
import { useId, useState } from "react";
import { usePartnerName } from "@/components/auth/member-names";
import { v2MemorySource } from "@/lib/garden-v2/memory-source";
import { flowerTypes, type FlowerType } from "@/lib/garden-v2/model";
import type { MemoryFilters, MemoryItem } from "@/lib/memories/model";
import { useMemories } from "@/lib/memories/use-memories";
import v2 from "../garden-v2.module.css";
import { MemoryCard } from "./memory-card";
import styles from "./overlays.module.css";

type Person = "both" | "you" | "partner";

/**
 * The new garden's Memories: every moment from its flowers as painted cards,
 * newest first. Read only; the feed keeps the legacy contract (decision 0018)
 * over new-garden content. "Written by" reads the album as one person's
 * journal (decision 0060); a flower filter narrows it further.
 */
export function MemoriesView({ memberId, onVisit }: { memberId: 1 | 2; onVisit: (flowerId: string) => void }) {
  const partner = usePartnerName();
  const [person, setPerson] = useState<Person>("both");
  const [type, setType] = useState<FlowerType | "">("");
  const typeId = useId();
  const author = person === "you" ? memberId : person === "partner" ? (memberId === 1 ? 2 : 1) : undefined;
  const filters: MemoryFilters = { ...(author ? { author } : {}), ...(type ? { type } : {}) };
  const people: [Person, string][] = [
    ["both", "both of us"],
    ["you", "you"],
    ["partner", partner.short],
  ];
  return (
    <div className={styles.stack}>
      <div className={styles.filters}>
        <div className={styles.chips} role="group" aria-label="Written by">
          {people.map(([key, label]) => (
            <button key={key} type="button" className={styles.chip} aria-pressed={person === key} onClick={() => setPerson(key)}>
              {label}
            </button>
          ))}
        </div>
        <label className={styles.select} htmlFor={typeId}>
          <span className={v2.srOnly}>Flower</span>
          <select id={typeId} value={type} onChange={(event) => setType(event.target.value as FlowerType | "")}>
            <option value="">every flower</option>
            {flowerTypes.map((t) => (
              <option key={t} value={t}>
                {t.replace(/-/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* A new filter deliberately starts a new browse. */}
      <MemoryFeed key={`${person}:${type}`} filters={filters} memberId={memberId} filtered={!!author || !!type} onVisit={onVisit} />
    </div>
  );
}

function MemoryFeed({ filters, memberId, filtered, onVisit }: { filters: MemoryFilters; memberId: 1 | 2; filtered: boolean; onVisit: (flowerId: string) => void }) {
  // Filters are fixed for this feed's life (it is keyed by them), so one object is enough.
  const [stable] = useState(filters);
  const feed = useMemories(undefined, stable, v2MemorySource);
  return (
    <>
      <FeedControls feed={feed} noun="memories" />
      {feed.ready && !feed.items.length && !feed.error && (
        <p className={styles.empty}>
          {filtered
            ? "No memories match that yet."
            : "Your first memory appears here once one of you cares for a flower. Every note, song, photo and wish is kept."}
        </p>
      )}
      <ol className={styles.album}>
        {feed.items.map((item: MemoryItem) => (
          <li key={item.key} data-wide={item.kind === "peony" || undefined}>
            <MemoryCard item={item} memberId={memberId} onVisit={onVisit} />
          </li>
        ))}
      </ol>
      {feed.more && feed.oldest && (
        <button type="button" className={v2.secondary} disabled={feed.busy} onClick={feed.older}>
          older memories
        </button>
      )}
      <p className={styles.footnote}>
        Memories are read only. Garden days begin at 4 a.m. Pacific; wishes and date keepsakes sit on their planting day. To
        edit something you shared today, visit its flower.
      </p>
    </>
  );
}

type Feed = ReturnType<typeof useMemories>;

/** Refresh, live state, newer arrivals and errors, shared by Memories and Songs. */
export function FeedControls({ feed, noun }: { feed: Feed; noun: string }) {
  const retry = !!feed.error || !feed.ready;
  return (
    <>
      <div className={styles.feedBar}>
        <span className={styles.live} data-live={feed.connected || undefined}>
          {feed.connected ? "live" : "not live"}
          <span className={v2.srOnly}>{feed.connected ? " updates" : ", refresh to check"}</span>
        </span>
        <button type="button" className={v2.textButton} disabled={feed.busy} onClick={feed.refresh} aria-label={retry ? undefined : `Refresh ${noun}`}>
          {retry ? "try again" : "refresh"}
        </button>
      </div>
      {feed.error && (
        <p className={v2.error} role="alert">
          {feed.error}
        </p>
      )}
      <p role="status" className={styles.feedStatus}>
        {feed.busy ? `Loading ${noun}…` : feed.notice.replace(/memories/g, noun)}
        {feed.newerMore && ` More newer ${noun} are waiting; refresh again to gather them.`}
      </p>
      {feed.staged.length > 0 && (
        <button type="button" className={v2.secondary} disabled={feed.busy} onClick={feed.showNewer}>
          show {feed.staged.length} newer
        </button>
      )}
    </>
  );
}

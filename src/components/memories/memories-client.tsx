"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  memoryTypes,
  type MemoryFilters,
  type MemoryPage,
  validMemoryQuery,
} from "@/lib/memories/model";
import { useMemories } from "@/lib/memories/use-memories";
import { MemoryCard, flowerName } from "./memory-card";
import styles from "./memories.module.css";
const all: MemoryFilters = {};
export function MemoriesClient({
  initial,
  memberId,
}: {
  initial: MemoryPage;
  memberId: 1 | 2;
}) {
  const [filters, setFilters] = useState<MemoryFilters>(all);
  const [filterError, setFilterError] = useState("");
  const [revision, setRevision] = useState(0);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selected = Object.fromEntries(
      [...form.entries()].filter(([, v]) => v !== ""),
    );
    const next = {
      ...selected,
      ...(selected.spot ? { spot: Number(selected.spot) } : {}),
    } as MemoryFilters;
    if (!validMemoryQuery({ kind: "latest", filters: next })) {
      setFilterError(
        "Choose a valid flower spot and a date range with the start before the end.",
      );
      return;
    }
    setFilterError("");
    setFilters(next);
    setRevision((n) => n + 1);
  }
  return (
    <section className={styles.collection} aria-labelledby="memories-title">
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Our shared story</p>
        <h1 id="memories-title">Our memories</h1>
        <p>
          Little moments, saved together. Revisit both of our contributions
          across every flower and permanent bloom.
        </p>
        <Link href="/garden">← Back to our garden</Link>
      </header>
      <form
        className={styles.filters}
        onSubmit={apply}
        aria-label="Browse memories"
      >
        <label>
          Flower type
          <select name="type" defaultValue="">
            <option value="">All flowers</option>
            {memoryTypes.map((type) => (
              <option value={type} key={type}>
                {flowerName(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Flower spot
          <input
            name="spot"
            type="number"
            min="1"
            max="2147483647"
            step="1"
            placeholder="Any spot"
          />
        </label>
        <label>
          From garden day
          <input name="from" type="date" />
        </label>
        <label>
          Through garden day
          <input name="to" type="date" />
        </label>
        <button className="button button-secondary" type="submit">
          Apply filters
        </button>
        <button
          className="button button-secondary"
          type="reset"
          onClick={() => {
            setFilters(all);
            setFilterError("");
            setRevision((n) => n + 1);
          }}
        >
          Clear filters
        </button>
        <p className={styles.filterHelp}>
          Garden days begin at 4 a.m. Pacific. Wish and Peony history cards are
          browsed by their planting day; each moment inside keeps its own
          original date.
        </p>
      </form>
      {filterError && <p role="alert">{filterError}</p>}
      <MemoryFeed
        key={revision}
        initial={revision === 0 ? initial : undefined}
        filters={filters}
        memberId={memberId}
      />
      <p className={styles.quiet}>
        Memories are read-only. To edit your current contribution within its
        allowed window, open its flower in the{" "}
        <Link href="/garden">garden</Link>. Original posting times stay the
        same.
      </p>
    </section>
  );
}
function MemoryFeed({
  initial,
  filters,
  memberId,
}: {
  initial?: MemoryPage;
  filters: MemoryFilters;
  memberId: 1 | 2;
}) {
  const feed = useMemories(initial, filters);
  return (
    <>
      <div className={styles.controls}>
        <button
          className="button button-secondary"
          disabled={feed.busy}
          onClick={feed.refresh}
        >
          {feed.ready ? "Refresh memories" : "Try again"}
        </button>
        <span className={styles.quiet}>
          {feed.connected
            ? "Partner updates connected"
            : "Refresh anytime to check for updates"}
        </span>
      </div>
      {feed.error && <p role="alert">{feed.error}</p>}
      <p role="status" className={styles.quiet}>
        {feed.busy ? "Loading memories…" : feed.notice}
        {feed.newerMore &&
          " More newer memories are available; refresh again to collect them."}
      </p>
      {feed.staged.length > 0 && (
        <button
          className="button button-secondary"
          disabled={feed.busy}
          onClick={feed.showNewer}
        >
          Show {feed.staged.length} newer{" "}
          {feed.staged.length === 1 ? "memory" : "memories"}
        </button>
      )}
      {feed.ready && !feed.items.length && (
        <div className={styles.empty}>
          <h2>No memories match these filters yet.</h2>
          <p>
            Your shared moments will appear here as you care for your garden.
            Try another flower or a wider date range.
          </p>
        </div>
      )}
      <ol className={styles.list}>
        {feed.items.map((item) => (
          <li key={item.key}>
            <MemoryCard item={item} memberId={memberId} />
          </li>
        ))}
      </ol>
      {feed.more && feed.oldest && (
        <button
          className="button button-secondary"
          disabled={feed.busy}
          onClick={feed.older}
        >
          Older memories
        </button>
      )}
    </>
  );
}

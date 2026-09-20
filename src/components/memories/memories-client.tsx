"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PixelIcon } from "@/components/ui/pixel-icon";
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
function activeFilterLabels(filters: MemoryFilters) {
  return [
    filters.type && flowerName(filters.type),
    filters.spot && `Spot ${filters.spot}`,
    filters.from && `From ${filters.from}`,
    filters.to && `Through ${filters.to}`,
  ].filter((label): label is string => !!label);
}
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = activeFilterLabels(filters);
  function clearFilters() {
    setFilters(all);
    setFilterError("");
    setFiltersOpen(false);
    setRevision((n) => n + 1);
  }
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
    setFiltersOpen(false);
    setRevision((n) => n + 1);
  }
  return (
    <section className={styles.collection} aria-labelledby="memories-title">
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Saved together</p>
        <h1 id="memories-title">Our memories</h1>
        <p>Little moments from every flower.</p>
      </header>
      <button
        type="button"
        className={styles.filterToggle}
        aria-expanded={filtersOpen}
        aria-controls="memory-filters"
        aria-label={
          activeFilters.length
            ? `Filters, ${activeFilters.length} active`
            : "Filters"
        }
        onClick={() => setFiltersOpen((open) => !open)}
      >
        <span>Filters</span>
        {activeFilters.length > 0 && (
          <span className={styles.filterCount} aria-hidden="true">
            {activeFilters.length} active
          </span>
        )}
        <span aria-hidden="true">{filtersOpen ? "−" : "+"}</span>
      </button>
      <form
        id="memory-filters"
        key={`filters-${revision}`}
        className={styles.filters}
        onSubmit={apply}
        aria-label="Browse memories"
        hidden={!filtersOpen}
      >
        <label>
          Flower type
          <select name="type" defaultValue={filters.type ?? ""}>
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
            defaultValue={filters.spot ?? ""}
          />
        </label>
        <label>
          From garden day
          <input name="from" type="date" defaultValue={filters.from ?? ""} />
        </label>
        <label>
          Through garden day
          <input name="to" type="date" defaultValue={filters.to ?? ""} />
        </label>
        <button className="button button-secondary" type="submit">
          Apply filters
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={clearFilters}
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
      {activeFilters.length > 0 && (
        <div
          className={styles.activeFilters}
          role="status"
          aria-label="Active filters"
        >
          <span>{activeFilters.join(" · ")}</span>
          <button type="button" onClick={clearFilters}>
            Clear
          </button>
        </div>
      )}
      <MemoryFeed
        key={revision}
        initial={revision === 0 ? initial : undefined}
        filters={filters}
        memberId={memberId}
        filtered={activeFilters.length > 0}
      />
      <details className={styles.notes}>
        <summary>About saved memories</summary>
        <p>
          Memories are read-only. To edit a current contribution during its
          allowed window, open the flower in the <Link href="/garden">garden</Link>.
          Original posting times stay the same.
        </p>
      </details>
    </section>
  );
}
function MemoryFeed({
  initial,
  filters,
  memberId,
  filtered,
}: {
  initial?: MemoryPage;
  filters: MemoryFilters;
  memberId: 1 | 2;
  filtered: boolean;
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
          {feed.error ? "Try again" : feed.ready ? "Refresh memories" : "Try again"}
        </button>
        <span className={styles.quiet}>
          {feed.connected ? "Live updates" : "Manual refresh"}
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
          <PixelIcon name="book" />
          <p>
            {filtered
              ? "No memories match those filters."
              : "Your first shared memory will appear here."}
          </p>
        </div>
      )}
      <ol className={styles.list}>
        {feed.items.map((item) => (
          <li key={item.key} className={item.kind === "peony" ? styles.wide : undefined}>
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

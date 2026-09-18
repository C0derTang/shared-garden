"use client";
import { useRef, useState } from "react";
import {
  canEditAt,
  moods,
  pacificTime,
  type CatalogItem,
  type Entry,
  type GardenState,
  type Plant,
} from "@/lib/garden/model";
import { compareTimestamps } from "@/lib/garden/timestamp";
import { loadFlowerHistory } from "@/lib/garden/actions";
import Link from "next/link";
import { SongPlayer } from "@/components/music/song-player";
import { FlowerSprite } from "./flower-sprite";
import { PhotoForm } from "@/components/media/photo-form";
import { PhotoViewer } from "@/components/media/photo-viewer";
import { DandelionWish } from "./dandelion-wish";
import { PeonyPanel } from "./peony-panel";
import { EntryForm } from "./entry-form";
import type { Mutate } from "./seed-picker";
import styles from "./garden.module.css";

function EntryContent({ entry, type }: { entry: Entry; type: string }) {
  const payload = entry.payload;
  if (type === "sunflower" && payload.media_id)
    return <PhotoViewer key={payload.media_id} mediaId={payload.media_id} />;
  if (type === "cactus") return <p>Checked in. I’m here.</p>;
  if (type === "hydrangea")
    return (
      <p>{moods.find((m) => m.key === payload.mood)?.label ?? "Mood saved"}</p>
    );
  if (type === "tulip")
    return (
      <SongPlayer
        title={payload.title ?? ""}
        artist={payload.artist ?? ""}
        url={payload.url ?? ""}
      />
    );
  return (
    <p className={styles.entryText}>
      {payload.text ??
        "This contribution uses a special format. Its viewer is coming soon."}
    </p>
  );
}
export function CareMarkers({
  plant,
  memberId,
}: {
  plant: Plant;
  memberId: 1 | 2;
}) {
  const you =
    memberId === 1 ? plant.member1_submitted : plant.member2_submitted;
  const partner =
    memberId === 1 ? plant.member2_submitted : plant.member1_submitted;
  return (
    <div className={styles.markers}>
      <span data-cared={you}>
        {you ? "●" : "○"}{" "}
        <span>You · {you ? "cared today" : "not yet today"}</span>
      </span>
      <span data-cared={partner}>
        {partner ? "●" : "○"}{" "}
        <span>Partner · {partner ? "cared today" : "not yet today"}</span>
      </span>
    </div>
  );
}
export function FlowerSheet({
  plant,
  state,
  item,
  now,
  busy,
  mutate,
}: {
  plant: Plant;
  state: GardenState;
  item: CatalogItem;
  now: number;
  busy: boolean;
  mutate: Mutate;
}) {
  const [editing, setEditing] = useState<Entry | null>(null);
  const [saved, setSaved] = useState(false);
  const [historyPage, setHistoryPage] = useState<{
    day: string;
    entries: Entry[];
    more: boolean;
  } | null>(null);
  const [songVersions, setSongVersions] = useState(
    () => new Map<number, Entry>(),
  );
  // Retain observed replacements before pages load and across older snapshots.
  // Day-tagged history below still hides all old-day pages until an explicit reread.
  if (item.type_key === "tulip") {
    let observed = songVersions;
    for (const entry of [
      ...plant.entries,
      ...(historyPage?.day === state.garden_day ? historyPage.entries : []),
    ]) {
      const previous = observed.get(entry.id);
      if (
        !previous ||
        compareTimestamps(entry.updated_at, previous.updated_at) > 0
      ) {
        if (observed === songVersions) observed = new Map(songVersions);
        observed.set(entry.id, entry);
      }
    }
    if (observed !== songVersions) setSongVersions(observed);
  }
  // Current entries may be replaced by either member from another session.
  // Reconcile at render time so an older history response cannot restore a
  // superseded attachment. At rollover, reread history: the final prior-day
  // replacement may no longer be present in today's authoritative snapshot.
  const history =
    historyPage?.day === state.garden_day
      ? historyPage.entries.map((entry) => {
          const current =
            item.type_key === "tulip"
              ? songVersions.get(entry.id)
              : plant.entries.find((candidate) => candidate.id === entry.id);
          return current &&
            compareTimestamps(current.updated_at, entry.updated_at) >= 0
            ? current
            : entry;
        })
      : null;
  const more = historyPage?.day === state.garden_day && historyPage.more;
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyLock = useRef(false);
  const flower = plant.flower;
  const bloomed = flower.first_bloom_at !== null;
  const ordinaryDone = bloomed && item.type_key !== "cactus";
  const own = plant.entries.find(
    (entry) => entry.author_id === state.member_id,
  );
  const unsupported = item.type_key === "bluebell";
  const moonClosed = item.type_key === "moonflower" && !state.moonflower_open;
  const pair = [1, 2].map((id) =>
    moods.find(
      (m) =>
        m.key === plant.entries.find((e) => e.author_id === id)?.payload.mood,
    ),
  );
  async function readHistory() {
    if (historyLock.current) return;
    historyLock.current = true;
    setHistoryBusy(true);
    setHistoryError(null);
    try {
      const result = await loadFlowerHistory(
        flower.id,
        history?.at(-1)?.id ?? null,
      );
      setHistoryError(result.error);
      if (!result.error) {
        setHistoryPage((old) => {
          const previous = old?.day === state.garden_day ? old.entries : [];
          return {
            day: state.garden_day,
            entries: [
              ...previous,
              ...result.entries.filter(
                (entry) => !previous.some((prior) => prior.id === entry.id),
              ),
            ],
            more: result.entries.length === 20,
          };
        });
      }
    } catch {
      setHistoryError("History could not load. Try again when connected.");
    } finally {
      historyLock.current = false;
      setHistoryBusy(false);
    }
  }
  return (
    <div className={styles.stack}>
      <div className={styles.flowerSummary}>
        <FlowerSprite
          {...(item.type_key === "dandelion"
            ? { type: "dandelion" as const, fulfilled: !!flower.fulfilled_at }
            : { type: item.type_key })}
          growthUnits={flower.growth_units}
          growthTarget={item.growth_target}
          bloomed={bloomed}
          size={96}
        />
        <div>
          <strong>
            {bloomed
              ? "A permanent bloom"
              : `${flower.growth_units} of ${item.growth_target} ${item.type_key === "peony" ? "milestones" : "growth units"}`}
          </strong>
          <progress
            value={flower.growth_units}
            max={item.growth_target}
            aria-label={`${item.display_name} progress`}
          />
          <p className={styles.quiet}>
            Spot {flower.spot} · Planted {flower.planted_day}
          </p>
        </div>
      </div>
      {item.type_key === "peony" ? (
        <PeonyPanel
          flowerId={flower.id}
          refreshKey={state.server_now}
          now={now}
          busy={busy}
          mutate={mutate}
        />
      ) : (
        <>
          <CareMarkers plant={plant} memberId={state.member_id} />
          {item.type_key === "tulip" && (
            <Link href="/garden/songs">Our song collection</Link>
          )}
          <DandelionWish
            flower={flower}
            memberId={state.member_id}
            busy={busy}
            mutate={mutate}
          />
          {plant.daisy_question && (
            <div className={styles.question}>
              <span className="eyebrow">
                TODAY’S{" "}
                {plant.daisy_question.category === "light" ? "LIGHT" : "DEEPER"}{" "}
                QUESTION
              </span>
              <p>{plant.daisy_question.prompt}</p>
            </div>
          )}
          {item.type_key === "hydrangea" && pair[0] && pair[1] && (
            <div
              className={styles.blend}
              role="img"
              aria-label={`Today's mood blend: ${pair[0].label} and ${pair[1].label}`}
            >
              <span style={{ backgroundColor: pair[0].color }} />
              <span style={{ backgroundColor: pair[1].color }} />
              <p>
                {pair[0].label} + {pair[1].label}
              </p>
            </div>
          )}
          <section className={styles.stack} aria-label="Today's entries">
            <h3>Today, together</h3>
            {plant.entries.length === 0 && (
              <p className={styles.quiet}>A little space for today’s care.</p>
            )}
            {plant.entries.map((entry) => (
              <article className={styles.entry} key={entry.id}>
                <div className={styles.entryMeta}>
                  <strong>
                    {entry.author_id === state.member_id
                      ? "You"
                      : "Your partner"}
                  </strong>
                  <time dateTime={entry.original_posted_at}>
                    {pacificTime(entry.original_posted_at)}
                  </time>
                </div>
                <EntryContent entry={entry} type={item.type_key} />
                {canEditAt(entry, state, now) ? (
                  <div className={styles.editRow}>
                    <small>
                      Edit {entry.edit_deadline_inclusive ? "until" : "before"}{" "}
                      {pacificTime(entry.edit_deadline!)} · Original time stays
                      the same.
                    </small>
                    <button
                      className="button button-secondary"
                      onClick={() => {
                        setEditing(entry);
                        setSaved(false);
                      }}
                    >
                      Edit your entry
                    </button>
                  </div>
                ) : (
                  <small className={styles.quiet}>
                    Read-only
                    {entry.author_id === state.member_id
                      ? " · Edit window ended"
                      : " · Your partner’s entry"}
                  </small>
                )}
              </article>
            ))}
          </section>
          {saved && (
            <p role="status" className={styles.notice}>
              Your care is saved and visible to your partner.
            </p>
          )}
          {editing && item.type_key === "sunflower" ? (
            <PhotoForm
              key={editing.id}
              {...{ plant, state, now, busy, mutate, editing }}
              onSaved={() => {
                setEditing(null);
                setHistoryPage(null);
                setSaved(true);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : editing ? (
            <EntryForm
              key={editing.id}
              {...{ plant, state, item, now, busy, mutate, editing }}
              onSaved={() => {
                setEditing(null);
                setSaved(true);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : ordinaryDone ? (
            <p className={styles.notice}>
              This bloom is here to stay. No more daily care is needed.
            </p>
          ) : unsupported ? (
            <p className={styles.notice}>
              {item.type_key === "sunflower"
                ? "Photo sharing"
                : item.type_key === "bluebell"
                  ? "Voice recording and playback"
                  : "The four shared date milestones"}{" "}
              will arrive soon. This flower stays in your garden; that care
              cannot be submitted yet.
            </p>
          ) : own ? (
            <p className={styles.quiet}>
              Your care for this garden day is already here.
              {item.type_key === "cactus"
                ? " Come back tomorrow for another check-in."
                : " When both of you contribute, growth settles at 4 a.m."}
            </p>
          ) : item.type_key === "sunflower" ? (
            <PhotoForm
              {...{ plant, state, now, busy, mutate }}
              onSaved={() => setSaved(true)}
            />
          ) : (
            <EntryForm
              {...{ plant, state, item, now, busy, mutate }}
              unavailable={
                moonClosed
                  ? "Moonflower opens from 10 p.m. to 4 a.m. Pacific. You can keep a draft here, then share it during the open window."
                  : undefined
              }
              onSaved={() => setSaved(true)}
            />
          )}
          {!ordinaryDone && !unsupported && (
            <p className={styles.quiet}>
              {item.type_key === "cactus"
                ? "Cactus never loses growth, and you can keep checking in after it blooms."
                : "Both people’s care on the same garden day adds one growth unit at rollover. A missed pair loses one unit, down to zero."}
            </p>
          )}
          <section className={styles.history} aria-label="Flower history">
            <h3>Memories in this flower</h3>
            <p className={styles.quiet}>
              Older entries are read-only. Newest first.
            </p>
            {history?.map((entry) => (
              <article className={styles.entry} key={entry.id}>
                <div className={styles.entryMeta}>
                  <strong>
                    {entry.author_id === state.member_id
                      ? "You"
                      : "Your partner"}
                  </strong>
                  <time dateTime={entry.original_posted_at}>
                    {entry.garden_day} · {pacificTime(entry.original_posted_at)}
                  </time>
                </div>
                <EntryContent entry={entry} type={item.type_key} />
                {entry.payload.question_id && (
                  <small>Question {entry.payload.question_id}</small>
                )}
              </article>
            ))}
            {history?.length === 0 && <p>No earlier entries yet.</p>}
            {historyError && (
              <p role="alert" className={styles.error}>
                {historyError}
              </p>
            )}
            {(history === null || more) && (
              <button
                className="button button-secondary"
                disabled={historyBusy}
                onClick={() => void readHistory()}
              >
                {historyBusy
                  ? "Loading history…"
                  : history === null
                    ? "Read history"
                    : "Older entries"}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}

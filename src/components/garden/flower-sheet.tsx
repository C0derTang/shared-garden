"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
import { VoiceForm } from "@/components/media/voice-form";
import { VoiceViewer } from "@/components/media/voice-player";
import { PhotoViewer } from "@/components/media/photo-viewer";
import { DandelionWish } from "./dandelion-wish";
import { PeonyPanel } from "./peony-panel";
import { EntryReplies } from "./entry-replies";
import { EntryForm } from "./entry-form";
import { flowerCards, nextDueFlower, type FlowerCard } from "./flower-cards";
import { careStatus } from "./due-today";
import { SheetCue } from "./today-card";
import type { Mutate } from "./seed-picker";
import styles from "./garden.module.css";
import sheetStyles from "./flower-sheet.module.css";

function EntryContent({ entry, type }: { entry: Entry; type: string }) {
  const payload = entry.payload;
  if (type === "sunflower" && payload.media_id)
    return <PhotoViewer key={payload.media_id} mediaId={payload.media_id} />;
  if (type === "bluebell" && payload.media_id)
    return <VoiceViewer key={payload.media_id} mediaId={payload.media_id} />;
  if (type === "cactus") return <p>Checked in. I’m here.</p>;
  if (type === "hydrangea") {
    const mood = moods.find((m) => m.key === payload.mood);
    return mood ? (
      <p className={sheetStyles.savedMood}>
        <span
          className={sheetStyles.savedSwatch}
          style={{ backgroundColor: mood.color }}
          aria-hidden="true"
          data-mood-swatch={mood.key}
        />
        {mood.label}
      </p>
    ) : (
      <p>Mood saved</p>
    );
  }
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
function GrowthSummary({
  plant,
  item,
  children,
}: {
  plant: Plant;
  item: CatalogItem;
  /** The one-line flower cue (decision 0051). */
  children?: ReactNode;
}) {
  const flower = plant.flower;
  const bloomed = flower.first_bloom_at !== null;
  const type = item.type_key;
  const target = item.growth_target;
  const units = Math.min(flower.growth_units, target);
  const filled = bloomed ? target : units;
  const unit = type === "peony" ? "milestones" : "growth units";
  const line = flower.fulfilled_at
    ? "Wish fulfilled · a keepsake"
    : bloomed
      ? type === "cactus"
        ? "In bloom · check-ins continue"
        : "In bloom · permanent"
      : type === "peony"
        ? `${units} of ${target} milestones`
        : null;
  return (
    <div className={sheetStyles.summary}>
      <span className={sheetStyles.spriteSlot}>
        <FlowerSprite
          {...(type === "dandelion"
            ? { type: "dandelion" as const, fulfilled: !!flower.fulfilled_at }
            : { type })}
          growthUnits={flower.growth_units}
          growthTarget={target}
          bloomed={bloomed}
          size={64}
        />
      </span>
      <div className={sheetStyles.growth}>
        <p className={sheetStyles.growthLine}>
          {line ? (
            <strong>{line}</strong>
          ) : (
            <>
              <strong>
                {units} of {target}
              </strong>
              <span>
                {" · "}+1 at 4 a.m. when you both{" "}
                {type === "cactus" ? "check in" : "care"}
              </span>
            </>
          )}
        </p>
        <div
          className={sheetStyles.segments}
          data-bloomed={bloomed}
          role="progressbar"
          aria-label={`${item.display_name} progress`}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={bloomed ? target : units}
          aria-valuetext={
            bloomed ? "In bloom" : `${units} of ${target} ${unit}`
          }
        >
          {Array.from({ length: target }, (_, index) => (
            <i key={index} data-filled={index < filled} />
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
function CareCard({
  card,
  dailyCare,
  closed = false,
  children,
}: {
  card: FlowerCard;
  dailyCare: boolean;
  /** A Moonflower outside its hours: your turn waits for 10 p.m. */
  closed?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const you = card.who === "you";
  const opens = you && closed && !card.cared;
  const status = card.cared
    ? "Cared today"
    : opens
      ? "Opens 10 p.m."
      : you
        ? "Your turn"
        : "Not yet today";
  return (
    <article
      className={sheetStyles.card}
      data-who={card.who}
      aria-labelledby={id}
    >
      <header className={sheetStyles.cardHead} data-care={dailyCare || undefined}>
        {dailyCare && (
          <span
            className={sheetStyles.cardDot}
            data-cared={card.cared}
            aria-hidden="true"
          />
        )}
        <h4 id={id}>{you ? "You" : "Partner"}</h4>
        {dailyCare && (
          <span
            className={sheetStyles.cardStatus}
            data-tone={card.cared ? "cared" : you && !opens ? "turn" : "waiting"}
          >
            {status}
          </span>
        )}
      </header>
      {children}
    </article>
  );
}
export function FlowerSheet({
  plant,
  state,
  item,
  now,
  busy,
  mutate,
  onVisit,
  onClose,
}: {
  plant: Plant;
  state: GardenState;
  item: CatalogItem;
  now: number;
  busy: boolean;
  mutate: Mutate;
  /** Opens another spot's sheet (the garden's `setOpenSpot`). */
  onVisit?: (spot: number) => void;
  onClose?: () => void;
}) {
  const [editing, setEditing] = useState<Entry | null>(null);
  // "share" after a new entry (offers the next flower), "edit" after an edit.
  const [saved, setSaved] = useState<"share" | "edit" | null>(null);
  const nextAction = useRef<HTMLButtonElement>(null);
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
  const cards = flowerCards(plant, state.member_id, !ordinaryDone);
  const mediaFlower =
    item.type_key === "sunflower" || item.type_key === "bluebell";
  const MediaForm = item.type_key === "bluebell" ? VoiceForm : PhotoForm;
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
  // After a new share, carry focus to the next step so the round keeps flowing.
  // Focus alone scrolls only until the button touches the sheet's edge, so it
  // then scrolls the button's whole focus ring and lip into view (its scroll
  // margin covers them).
  useEffect(() => {
    const button = nextAction.current;
    if (saved !== "share" || !button) return;
    button.focus({ preventScroll: true });
    button.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [saved]);
  const next = saved === "share" ? nextDueFlower(state, flower.spot) : null;
  const nextItem = next
    ? state.catalog.find((c) => c.type_key === next.flower.type_key)
    : undefined;
  // Side by side only when both cards are short read-only notes.
  const sideBySide =
    cards.length === 2 &&
    !editing &&
    !!own &&
    !mediaFlower &&
    item.type_key !== "tulip";
  const newShare = mediaFlower ? (
    <MediaForm
      {...{ plant, state, now, busy, mutate }}
      onSaved={() => setSaved("share")}
    />
  ) : (
    <EntryForm
      {...{ plant, state, item, now, busy, mutate }}
      unavailable={
        moonClosed
          ? "Moonflower opens from 10 p.m. to 4 a.m. Pacific. You can keep a draft here, then share it during the open window."
          : undefined
      }
      onSaved={() => setSaved("share")}
    />
  );
  function todayEntry(entry: Entry) {
    const mine = entry.author_id === state.member_id;
    return (
      <div className={sheetStyles.cardEntry} key={entry.id}>
        <time
          className={sheetStyles.entryTime}
          dateTime={entry.original_posted_at}
        >
          {pacificTime(entry.original_posted_at)}
        </time>
        <EntryContent entry={entry} type={item.type_key} />
        <EntryReplies
          entryId={entry.id}
          authorId={entry.author_id}
          memberId={state.member_id}
          refreshKey={state.server_now}
        />
        {mine &&
          (canEditAt(entry, state, now) ? (
            <div className={styles.editRow}>
              <small>
                Edit {entry.edit_deadline_inclusive ? "until" : "before"}{" "}
                {pacificTime(entry.edit_deadline!)} · Original time stays the
                same.
              </small>
              {editing?.id !== entry.id && (
                <button
                  className="button button-secondary"
                  onClick={() => {
                    setEditing(entry);
                    setSaved(null);
                  }}
                >
                  Edit your entry
                </button>
              )}
            </div>
          ) : (
            <small className={styles.quiet}>Edit window ended</small>
          ))}
      </div>
    );
  }
  return (
    <div className={`${styles.stack} ${sheetStyles.sheet}`}>
      <GrowthSummary plant={plant} item={item}>
        <SheetCue status={careStatus(plant, item, state)} />
      </GrowthSummary>
      <details className={sheetStyles.details}>
        <summary>Details</summary>
        <div>
          <p>
            <strong>{bloomed ? "Permanent bloom" : "Growing"}</strong>
            {" · "}Spot {flower.spot} · Planted {flower.planted_day}
          </p>
          {item.type_key !== "peony" && (
            <p className={styles.quiet}>
              {ordinaryDone
                ? "No daily care is needed."
                : item.type_key === "cactus"
                  ? "Cactus never loses growth, and you can keep checking in after it blooms."
                  : "Both people’s care on the same garden day adds one growth unit at rollover. A missed pair loses one unit, down to zero."}
            </p>
          )}
        </div>
      </details>
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
          {cards.length > 0 && (
            <section className={sheetStyles.today} aria-label="Today's entries">
              <h3 className={sheetStyles.sectionTitle}>Today</h3>
              <div
                className={sheetStyles.cards}
                data-layout={sideBySide ? "pair" : "stack"}
              >
                {cards.map((card) => (
                  <CareCard
                    key={card.who}
                    card={card}
                    dailyCare={!ordinaryDone}
                    closed={moonClosed}
                  >
                    {card.entries.map(todayEntry)}
                    {card.who === "partner" ? (
                      card.entries.length === 0 && (
                        <p className={sheetStyles.placeholder}>
                          {card.cared
                            ? "Shared today."
                            : "Their care shows up here as soon as they share."}
                        </p>
                      )
                    ) : editing && mediaFlower ? (
                      <MediaForm
                        key={editing.id}
                        {...{ plant, state, now, busy, mutate, editing }}
                        onSaved={() => {
                          setEditing(null);
                          setHistoryPage(null);
                          setSaved("edit");
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    ) : editing ? (
                      <EntryForm
                        key={editing.id}
                        {...{ plant, state, item, now, busy, mutate, editing }}
                        onSaved={() => {
                          setEditing(null);
                          setSaved("edit");
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    ) : ordinaryDone || own ? null : (
                      newShare
                    )}
                  </CareCard>
                ))}
              </div>
            </section>
          )}
          {saved && (
            <div className={sheetStyles.saved}>
              <p role="status" className={styles.notice}>
                Saved · your partner can see it now.
              </p>
              {saved === "share" &&
                (next && nextItem && onVisit ? (
                  <button
                    ref={nextAction}
                    type="button"
                    className="button button-primary"
                    onClick={() => onVisit(next.flower.spot)}
                  >
                    Next: {nextItem.display_name}{" "}
                    <span aria-hidden="true">→</span>
                  </button>
                ) : !next ? (
                  <div className={sheetStyles.doneRow}>
                    <p className={sheetStyles.doneLine}>
                      That’s everything for today{" "}
                      <span aria-hidden="true">✿</span>
                    </p>
                    {onClose && (
                      <button
                        ref={nextAction}
                        type="button"
                        className="button button-secondary"
                        aria-label="Close and return to the garden"
                        onClick={onClose}
                      >
                        Close
                      </button>
                    )}
                  </div>
                ) : null)}
            </div>
          )}
          <section
            className={`${styles.history} ${sheetStyles.history}`}
            aria-label="Flower history"
          >
            {history?.map((entry) => (
              <article className={sheetStyles.historyEntry} key={entry.id}>
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
                <EntryReplies
                  entryId={entry.id}
                  authorId={entry.author_id}
                  memberId={state.member_id}
                  refreshKey={state.server_now}
                />
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
                className={sheetStyles.compactButton}
                disabled={historyBusy}
                onClick={() => void readHistory()}
                aria-label={
                  historyBusy
                    ? "Loading history"
                    : history === null
                      ? "Read history"
                      : "Older entries"
                }
              >
                {historyBusy
                  ? "Loading…"
                  : history === null
                    ? "History"
                    : "Older"}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}

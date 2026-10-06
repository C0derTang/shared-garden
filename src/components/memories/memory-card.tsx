"use client";
import { usePartnerName } from "@/components/auth/member-names";
import { useId, useState } from "react";
import {
  FlowerSprite,
  type FlowerType,
} from "@/components/garden/flower-sprite";
import { EntryReplies } from "@/components/garden/entry-replies";
import { GardenSpotLink } from "@/components/garden/spot-request";
import { PhotoViewer } from "@/components/media/photo-viewer";
import { VoiceViewer } from "@/components/media/voice-player";
import { SongPlayer } from "@/components/music/song-player";
import { PixelIcon } from "@/components/ui/pixel-icon";
import { moodLabel, moodPick, moodSwatches, moodTone, OTHER_MOOD, type MoodPick } from "@/lib/garden/model";
import type { MemoryItem, MemoryPeony } from "@/lib/memories/model";
import styles from "./memories.module.css";
export const flowerName = (type: string) =>
  type.charAt(0).toUpperCase() + type.slice(1);
const authorName = (id: 1 | 2, memberId: 1 | 2, name: ReturnType<typeof usePartnerName>, inline = false) =>
  id === memberId ? (inline ? "you" : "You") : (inline ? name.object : name.subject);
const dateTime = (value: string, short = false) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    // The card's date plaque already carries the year.
    year: short ? undefined : "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
// The album plaque shows the garden day as a short date, such as Sep 18, 2026.
const plaqueDate = (day: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
function Posted({ at, day, short }: { at: string; day?: string; short?: boolean }) {
  return (
    <>
      <time dateTime={at}>{dateTime(at, short)}</time>
      {day && <span className={styles.day}>Garden day {day}</span>}
    </>
  );
}
function LazyPhoto({ mediaId }: { mediaId: string }) {
  const [open, setOpen] = useState(false);
  // Only the placeholder is capped; a loaded photo keeps the full card width.
  return (
    <div
      className={`${styles.media} ${styles.photoMedia} ${open ? "" : styles.photoClosed}`}
    >
      {open ? (
        <PhotoViewer mediaId={mediaId} />
      ) : (
        <div
          className={styles.photoPlaceholder}
          role="img"
          aria-label="Private Sunflower photo"
        >
          <PixelIcon name="flower" />
          <span>Private photo</span>
        </div>
      )}
      <button
        className="button button-secondary"
        onClick={() => setOpen(!open)}
      >
        {open ? "Close private photo" : "Load private photo"}
      </button>
    </div>
  );
}
function ReplyHistory({ item, memberId }: { item: MemoryItem; memberId: 1 | 2 }) {
  const [open, setOpen] = useState(false);
  const historyId = useId();
  return <div className={styles.replyHistory}>
    <button type="button" className={styles.historyToggle} aria-expanded={open}
      aria-controls={historyId} onClick={() => setOpen(expanded => !expanded)}>
      <span>Reply history</span><span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    <div id={historyId} hidden={!open} className={styles.historyBody}>
      {open && <EntryReplies entryId={item.source_id} authorId={item.entry!.author_id}
        memberId={memberId} refreshKey={item.read_at} readOnly />}
    </div>
  </div>;
}
const PREVIEW_LENGTH = 170;
function preview(text: string) {
  if (text.length <= PREVIEW_LENGTH) return text;
  const boundary = text.lastIndexOf(" ", PREVIEW_LENGTH);
  return `${text.slice(0, boundary > 110 ? boundary : PREVIEW_LENGTH).trimEnd()}…`;
}
function ExpandableText({
  text,
  label = "Read full memory",
}: {
  text: string;
  label?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const short = preview(text);
  return (
    <div className={styles.expandableText}>
      <p className={styles.text}>{expanded ? text : short}</p>
      {short !== text && (
        <button
          type="button"
          className={styles.textToggle}
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Show less" : label}
        </button>
      )}
    </div>
  );
}
function FlowerCue({ type, pick, authorId }: { type: FlowerType; pick?: MoodPick | null; authorId?: number }) {
  const common = {
    growthUnits: 1,
    growthTarget: 1,
    bloomed: true,
    presentation: "full-bloom" as const,
    decorative: true,
    size: 64 as const,
    className: styles.flowerCue,
  };
  if (type === "hydrangea")
    return <FlowerSprite type="hydrangea" moods={[authorId === 1 && pick ? moodTone(pick) : null, authorId === 2 && pick ? moodTone(pick) : null]} {...common} />;
  if (type === "dandelion")
    return <FlowerSprite type="dandelion" {...common} />;
  return <FlowerSprite type={type} {...common} />;
}
const milestoneNames = [
  "",
  "Date ideas",
  "Shared plan",
  "Date happened",
  "Favorite moments",
];
function PeonyHistory({
  peony,
  memberId,
}: {
  peony: MemoryPeony;
  memberId: 1 | 2;
}) {
  const partnerName = usePartnerName();
  const completedCount = peony.completed.length;
  const [open, setOpen] = useState(false);
  const historyId = useId();
  return (
    <div className={styles.peony}>
      <button
        type="button"
        className={styles.historyToggle}
        aria-expanded={open}
        aria-controls={historyId}
        aria-label={`Open date history, ${completedCount} of 4 complete`}
        onClick={() => setOpen((expanded) => !expanded)}
      >
        <span>Date history</span>
        <span>{completedCount}/4 complete</span>
      </button>
      {open && <div className={styles.historyBody} id={historyId}>
        <p>The shared plan is its latest saved version.</p>
      {[1, 2, 3, 4].map((milestone) => {
        const contributions = peony.contributions.filter(
          (c) => c.milestone === milestone,
        );
        const completed = peony.completed.find(
          (c) => c.milestone === milestone,
        );
        return (
          <section key={milestone} className={styles.milestone}>
            <h5>
              {milestone}. {milestoneNames[milestone]}
            </h5>
            {milestone === 2 ? (
              peony.plan ? (
                <>
                  <p className={styles.text}>{peony.plan.activity}</p>
                  <p>
                    Planned for <Posted at={peony.plan.starts_at} />
                  </p>
                  <p className={styles.quiet}>
                    Plan version {peony.plan.version} · Last saved by{" "}
                    {authorName(peony.plan.updated_by, memberId, partnerName, true)}{" "}
                    <Posted at={peony.plan.updated_at} />
                  </p>
                  {peony.plan.acceptances.length ? (
                    peony.plan.acceptances.map((a) => (
                      <p key={a.author_id}>
                        <strong>{authorName(a.author_id, memberId, partnerName)}</strong>{" "}
                        accepted ·{" "}
                        <Posted at={a.original_posted_at} day={a.garden_day} />
                      </p>
                    ))
                  ) : (
                    <p>No current acceptances yet.</p>
                  )}
                </>
              ) : (
                <p>No shared plan saved yet.</p>
              )
            ) : contributions.length ? (
              contributions.map((c) => (
                <div key={c.author_id} className={styles.contribution}>
                  <p className={styles.meta}>
                    <strong>{authorName(c.author_id, memberId, partnerName)}</strong>
                    <Posted at={c.original_posted_at} day={c.garden_day} />
                  </p>
                  <p className={styles.text}>
                    {milestone === 3
                      ? "Confirmed that our date happened."
                      : c.text}
                  </p>
                </div>
              ))
            ) : (
              <p>No contributions to this milestone yet.</p>
            )}
            {completed && (
              <p className={styles.complete}>
                Completed together ·{" "}
                <Posted
                  at={completed.completed_at}
                  day={completed.garden_day}
                />
              </p>
            )}
          </section>
        );
      })}
      <p className={styles.quiet}>
        Earlier unfinished plan drafts and their cleared acceptances are not
        retained.
      </p>
      </div>}
    </div>
  );
}
export function MemoryCard({
  item,
  memberId,
}: {
  item: MemoryItem;
  memberId: 1 | 2;
}) {
  const partnerName = usePartnerName();
  const f = item.flower,
    entry = item.entry;
  const mood =
    entry && f.type_key === "hydrangea" ? moodPick(entry.payload) : null;
  return (
    <article
      className={styles.card}
      aria-labelledby={`memory-${item.key}`}
      data-flower={f.type_key}
    >
      <header className={styles.cardHeader}>
        <div className={styles.stamp}>
          <FlowerCue type={f.type_key} pick={mood} authorId={entry?.author_id} />
        </div>
        <div className={styles.cardHeading}>
          <div className={styles.headingRow}>
            <p className={styles.eyebrow}>
              {item.kind === "wish"
                ? "Shared wish"
                : item.kind === "peony"
                  ? "Date keepsake"
                  : "Saved moment"}
            </p>
            <p className={styles.plaque}>
              <span className={styles.visuallyHidden}>Garden day </span>
              <time dateTime={item.garden_day}>{plaqueDate(item.garden_day)}</time>
            </p>
          </div>
          <h4 id={`memory-${item.key}`} className={styles.cardTitle}>
            {flowerName(f.type_key)} <span>· Spot {f.spot}</span>
          </h4>
          {f.first_bloom_at && (
            <p className={styles.bloom}>
              Permanent bloom · Garden day {f.first_bloom_day}
            </p>
          )}
        </div>
      </header>
      <div className={styles.cardBody}>
      {f.shared_wish && (
        <blockquote className={styles.wish}>
          <ExpandableText text={f.shared_wish} label="Read full wish" />
        </blockquote>
      )}
      {item.kind === "wish" && (
        <p>
          {f.fulfilled_at && f.fulfilled_by ? (
            <>
              Wish fulfilled by{" "}
              {authorName(f.fulfilled_by, memberId, partnerName, true)} ·{" "}
              <Posted at={f.fulfilled_at} />. Its scattered seeds remain part of
              this one flower.
            </>
          ) : (
            "A wish we’re growing together."
          )}
        </p>
      )}
      {entry && (
        <div className={styles.content}>
          {f.type_key === "daisy" && (
            <blockquote className={styles.question}>
              <ExpandableText
                text={entry.question ?? ""}
                label="Read full question"
              />
            </blockquote>
          )}
          {f.type_key === "cactus" ? (
            <p>Checked in with our permanent Cactus.</p>
          ) : f.type_key === "tulip" ? (
            <div className={styles.compactMedia}>
              <SongPlayer
                title={entry.payload.title}
                artist={entry.payload.artist}
                url={entry.payload.url}
              />
            </div>
          ) : f.type_key === "sunflower" ? (
            <LazyPhoto
              key={entry.payload.media_id}
              mediaId={entry.payload.media_id}
            />
          ) : f.type_key === "bluebell" ? (
            <div className={styles.compactMedia}>
              <VoiceViewer mediaId={entry.payload.media_id} />
            </div>
          ) : mood ? (
            <>
              <p className={styles.mood}>
                {moodSwatches(mood).map((m) => (
                  <span key={m.key} style={{ background: m.color }} aria-hidden="true" />
                ))}
                {mood.mood === OTHER_MOOD && <span className={styles.otherSwatch} aria-hidden="true" />}
                {moodLabel(mood)}
              </p>
              {mood.note && <p className={styles.moodNote}>{mood.note}</p>}
            </>
          ) : (
            <ExpandableText text={entry.payload.text} />
          )}
        </div>
      )}
      {item.kind === "entry" && entry && <ReplyHistory key={item.key} item={item} memberId={memberId} />}
      {item.peony && <PeonyHistory peony={item.peony} memberId={memberId} />}
      </div>
      <footer className={styles.cardFooter}>
        <div className={styles.meta}>
          <strong>
            {entry
              ? authorName(entry.author_id, memberId, partnerName)
              : f.planted_by
                ? `Planted by ${authorName(f.planted_by, memberId, partnerName, true)}`
                : "Our garden"}
          </strong>
          <Posted at={item.at} short />
        </div>
        <GardenSpotLink
          request={{ spot: f.spot }}
          className={styles.openLink}
          aria-label={`Open in garden: ${flowerName(f.type_key)}, spot ${f.spot}`}
        >
          <PixelIcon name="sprout" />
          <span>Open in garden</span>
        </GardenSpotLink>
      </footer>
    </article>
  );
}

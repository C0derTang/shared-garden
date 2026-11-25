"use client";
import { useId, useState, type CSSProperties, type MouseEvent } from "react";
import { usePartnerName } from "@/components/auth/member-names";
import { EntryReplies } from "@/components/garden/entry-replies";
import { SongPlayer } from "@/components/music/song-player";
import { readRepliesV2, saveReplyV2 } from "@/lib/garden-v2/actions";
import { gardenDayLabel } from "@/lib/garden-v2/flowers";
import { moodLabel, moodPick, moodSwatches, OTHER_MOOD } from "@/lib/garden/moods";
import type { MemoryItem, MemoryPeony } from "@/lib/memories/model";
import v2 from "../garden-v2.module.css";
import styles from "./overlays.module.css";
import { V2Photo, V2Voice } from "./v2-media";

const v2Replies = { read: readRepliesV2, save: saveReplyV2 };

/** A soft tint per flower for each card's painted wash (presentation only). */
export const flowerTints: Record<string, string> = {
  rose: "#e0566b",
  cactus: "#8fbf7a",
  tulip: "#f08a7a",
  marigold: "#f2a93b",
  daisy: "#efe6cf",
  hydrangea: "#8fa8e8",
  sunflower: "#f6c945",
  snapdragon: "#e98bc0",
  moonflower: "#dcd8ff",
  bluebell: "#7f92e0",
  dandelion: "#f5d23c",
  "forget-me-not": "#8ec5f2",
  peony: "#f3a6be",
};

export const flowerWord = (type: string) => type.replace(/-/g, "‑");

const pacific = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
/** A real instant in Pacific time, e.g. "Nov 24, 9:15 PM PST". */
export const pacificMoment = (at: string) => pacific.format(new Date(at));

const PREVIEW = 220;
function Expandable({ text, label = "read more" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const cut = text.length > PREVIEW ? text.lastIndexOf(" ", PREVIEW) : -1;
  const short = text.length > PREVIEW ? `${text.slice(0, cut > 140 ? cut : PREVIEW).trimEnd()}…` : text;
  return (
    <>
      <p className={styles.memoryText}>{open ? text : short}</p>
      {short !== text && (
        <button type="button" className={styles.textToggle} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "show less" : label}
        </button>
      )}
    </>
  );
}

function Replies({ item, memberId }: { item: MemoryItem; memberId: 1 | 2 }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={styles.replyToggle}>
      <button type="button" className={styles.textToggle} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {open ? "hide replies" : "replies"}
      </button>
      <div id={id} hidden={!open} className={v2.replies}>
        {open && (
          <EntryReplies
            entryId={item.source_id}
            authorId={item.entry!.author_id}
            memberId={memberId}
            refreshKey={item.read_at}
            readOnly
            actions={v2Replies}
          />
        )}
      </div>
    </div>
  );
}

const milestones = ["", "date ideas", "the plan", "it happened", "favorite moments"];

function PeonyKeepsake({ peony, memberId }: { peony: MemoryPeony; memberId: 1 | 2 }) {
  const partner = usePartnerName();
  const [open, setOpen] = useState(false);
  const id = useId();
  const who = (author: 1 | 2) => (author === memberId ? "you" : partner.short);
  return (
    <div className={styles.peony}>
      <p className={styles.peonySteps} aria-label={`${peony.completed.length} of 4 milestones complete`}>
        {[1, 2, 3, 4].map((step) => (
          <i key={step} data-done={peony.completed.some((c) => c.milestone === step) || undefined} aria-hidden="true" />
        ))}
        <span aria-hidden="true">{peony.completed.length} of 4</span>
      </p>
      <button type="button" className={styles.textToggle} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {open ? "fold the keepsake" : "open the keepsake"}
      </button>
      <div id={id} hidden={!open} className={styles.peonyDetail}>
        {open &&
          [1, 2, 3, 4].map((step) => {
            const done = peony.completed.find((c) => c.milestone === step);
            const notes = peony.contributions.filter((c) => c.milestone === step);
            return (
              <section key={step} className={styles.milestone}>
                <h5>
                  {step}. {milestones[step]}
                </h5>
                {step === 2 ? (
                  peony.plan ? (
                    <>
                      <p className={styles.memoryText}>{peony.plan.activity}</p>
                      <p className={styles.meta}>
                        planned for <time dateTime={peony.plan.starts_at}>{pacificMoment(peony.plan.starts_at)}</time> · last saved by{" "}
                        {who(peony.plan.updated_by)}
                      </p>
                      {peony.plan.acceptances.map((a) => (
                        <p key={a.author_id} className={styles.meta}>
                          {who(a.author_id)} said yes · <time dateTime={a.original_posted_at}>{pacificMoment(a.original_posted_at)}</time>
                        </p>
                      ))}
                    </>
                  ) : (
                    <p className={styles.meta}>No shared plan yet.</p>
                  )
                ) : notes.length ? (
                  notes.map((c) => (
                    <p key={c.author_id} className={styles.memoryText}>
                      <span className={styles.who} data-who={c.author_id === memberId ? "you" : "partner"}>
                        {who(c.author_id)}:
                      </span>{" "}
                      {step === 3 ? "our date happened" : c.text}
                    </p>
                  ))
                ) : (
                  <p className={styles.meta}>Nothing here yet.</p>
                )}
                {done && <p className={styles.meta}>completed together · {gardenDayLabel(done.garden_day)}</p>}
              </section>
            );
          })}
      </div>
    </div>
  );
}

function Content({ item, memberId }: { item: MemoryItem; memberId: 1 | 2 }) {
  const partner = usePartnerName();
  const { flower, entry } = item;
  if (item.kind === "peony" && item.peony) return <PeonyKeepsake peony={item.peony} memberId={memberId} />;
  if (item.kind === "wish")
    return (
      <>
        {flower.shared_wish && (
          <blockquote className={styles.wish}>
            <Expandable text={flower.shared_wish} label="read the whole wish" />
          </blockquote>
        )}
        <p className={styles.meta}>
          {flower.fulfilled_at && flower.fulfilled_by
            ? `came true · ${flower.fulfilled_by === memberId ? "you" : partner.short} blew the seeds`
            : "a wish we’re growing together"}
        </p>
      </>
    );
  if (!entry) return null;
  switch (flower.type_key) {
    case "cactus":
      return <p className={styles.memoryText}>checked in with the cactus ✿</p>;
    case "tulip":
      return <SongPlayer title={entry.payload.title ?? ""} artist={entry.payload.artist ?? ""} url={entry.payload.url ?? ""} />;
    case "sunflower":
      return <V2Photo mediaId={entry.payload.media_id ?? ""} />;
    case "bluebell":
      return <V2Voice mediaId={entry.payload.media_id ?? ""} />;
    case "hydrangea": {
      const pick = moodPick(entry.payload);
      if (!pick) return null;
      return (
        <>
          <p className={styles.mood}>
            {moodSwatches(pick).map((m) => (
              <span key={m.key} className={v2.swatch} style={{ background: m.color }} aria-hidden="true" />
            ))}
            {pick.mood === OTHER_MOOD && <span className={`${v2.swatch} ${v2.otherSwatch}`} aria-hidden="true" />}
            {moodLabel(pick).toLowerCase()}
          </p>
          {pick.note && <p className={styles.memoryText}>{pick.note}</p>}
        </>
      );
    }
    case "daisy":
      return (
        <>
          {entry.question && entry.question_asked_by && (
            <p className={styles.meta}>{entry.question_asked_by === memberId ? "you asked" : `${partner.short} asked`}</p>
          )}
          {entry.question && <p className={styles.question}>{entry.question}</p>}
          <Expandable text={entry.payload.text ?? ""} />
        </>
      );
    default:
      return <Expandable text={entry.payload.text ?? ""} />;
  }
}

/**
 * One memory as a small painted card: the flower's tint, its name in
 * handwriting, the garden day, then the moment itself (text, song, photo,
 * voice memo, colors, wish or date keepsake) and who shared it.
 */
export function MemoryCard({ item, memberId, onVisit }: { item: MemoryItem; memberId: 1 | 2; onVisit: (flowerId: string) => void }) {
  const partner = usePartnerName();
  const { flower, entry } = item;
  const titleId = `memory-${item.key}`;
  const author = entry?.author_id ?? flower.planted_by;
  const who = author === null ? "us" : author === memberId ? "you" : partner.short;
  const eyebrow = item.kind === "wish" ? "a wish" : item.kind === "peony" ? "a date keepsake" : flower.type_key === "tulip" ? "a song" : "a moment";
  const visit = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onVisit(flower.id);
  };
  return (
    <article
      className={styles.memory}
      aria-labelledby={titleId}
      data-kind={item.kind}
      data-flower={flower.type_key}
      style={{ "--tint": flowerTints[flower.type_key] ?? "#f4c983" } as CSSProperties}
    >
      <header className={styles.memoryHead}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h3 id={titleId} className={styles.memoryTitle}>
          {flowerWord(flower.type_key)}
        </h3>
        <p className={styles.memoryDay}>
          <span className={v2.srOnly}>garden day </span>
          <time dateTime={item.garden_day}>{gardenDayLabel(item.garden_day)}</time>
          {flower.first_bloom_day && <span> · bloomed {gardenDayLabel(flower.first_bloom_day)}</span>}
        </p>
      </header>
      <div className={styles.memoryBody}>
        <Content item={item} memberId={memberId} />
      </div>
      {item.kind === "entry" && entry && <Replies item={item} memberId={memberId} />}
      <footer className={styles.memoryFoot}>
        <span className={styles.who} data-who={author === null ? undefined : author === memberId ? "you" : "partner"}>
          {item.kind === "entry" ? who : `planted by ${who}`}
        </span>
        <time dateTime={item.at} className={styles.meta}>
          {pacificMoment(item.at)}
        </time>
        <a
          className={styles.visit}
          href={`/garden?flower=${encodeURIComponent(flower.id)}`}
          aria-label={`Visit the ${flower.type_key} in the garden`}
          onClick={visit}
        >
          visit ↗
        </a>
      </footer>
    </article>
  );
}

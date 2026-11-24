"use client";
import { SongPlayer } from "@/components/music/song-player";
import { moodLabel, moodPick, moodSwatches, OTHER_MOOD, type MoodPick } from "@/lib/garden/moods";
import type { Entry } from "@/lib/garden-v2/model";
import styles from "./garden-v2.module.css";

/** Small painted swatches for a mood pick, with its words. */
export function MoodChip({ pick }: { pick: MoodPick }) {
  return (
    <span className={styles.moodChip}>
      {moodSwatches(pick).map((mood) => (
        <span key={mood.key} className={styles.swatch} style={{ backgroundColor: mood.color }} aria-hidden="true" data-mood-swatch={mood.key} />
      ))}
      {pick.mood === OTHER_MOOD && <span className={`${styles.swatch} ${styles.otherSwatch}`} aria-hidden="true" data-mood-swatch="other" />}
      <span>{moodLabel(pick)}</span>
    </span>
  );
}

/** One saved contribution, shown the way its flower shares it. */
export function EntryContent({ entry, type }: { entry: Entry; type: string }) {
  const payload = entry.payload;
  if (type === "cactus") return <p className={styles.entryText}>Checked in. I’m here.</p>;
  if (type === "hydrangea") {
    const pick = moodPick(payload);
    return pick ? (
      <div className={styles.entryMood}>
        <MoodChip pick={pick} />
        {pick.note && <p className={styles.entryText}>{pick.note}</p>}
      </div>
    ) : (
      <p className={styles.entryText}>A mood color.</p>
    );
  }
  if (type === "tulip") return <SongPlayer title={payload.title ?? ""} artist={payload.artist ?? ""} url={payload.url ?? ""} />;
  return <p className={styles.entryText}>{payload.text ?? "This contribution has a format this view cannot show yet."}</p>;
}

const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
/** A time of day in the garden's time zone, e.g. "9:41 PM". */
export const gardenTime = (value: string | number) => timeFormat.format(new Date(value));

const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" });
/** A date in the garden's time zone, e.g. "Nov 24". */
export const gardenDate = (value: string | number) => dateFormat.format(new Date(value));

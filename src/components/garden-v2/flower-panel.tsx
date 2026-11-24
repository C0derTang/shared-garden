"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePartnerName } from "@/components/auth/member-names";
import { EntryReplies, type ReplyActions } from "@/components/garden/entry-replies";
import { sheetCue } from "@/lib/garden/care";
import { moodBlend, moodLabel } from "@/lib/garden/moods";
import { loadFlowerHistoryV2, readRepliesV2, saveReplyV2 } from "@/lib/garden-v2/actions";
import { gardenCareStatus, gardenDayLabel, gardenTodayPlan } from "@/lib/garden-v2/flowers";
import { canEditAt, type CatalogItem, type Entry, type GardenState, type Plant } from "@/lib/garden-v2/model";
import { CareForm, type MutateV2 } from "./care-form";
import { EntryContent, gardenDate, gardenTime, MoodChip } from "./entry-view";
import styles from "./garden-v2.module.css";
import { PhotoCare, VoiceCare } from "./media-care";
import { PeonyMilestones } from "./peony-milestones";

const v2Replies: ReplyActions = { read: readRepliesV2, save: saveReplyV2 };

const MOONFLOWER_CLOSED =
  "Moonflower opens from 10 p.m. to 4 a.m. Pacific. Keep a draft here and share it once it opens.";

/** Growth as painted dots, with the rule in words. */
function Growth({ plant, item }: { plant: Plant; item: CatalogItem }) {
  const flower = plant.flower;
  const target = item.growth_target;
  const bloomed = flower.first_bloom_at !== null;
  const units = bloomed ? target : Math.min(flower.growth_units, target);
  const line = flower.fulfilled_at
    ? "wish fulfilled · a keepsake"
    : bloomed
      ? item.type_key === "cactus"
        ? "in bloom · check-ins continue"
        : `in bloom since ${gardenDayLabel(flower.first_bloom_day ?? flower.planted_day)}`
      : `${units} of ${target}`;
  return (
    <section className={styles.growth} aria-label="Growth">
      <p className={styles.growthLine}>{line}</p>
      <div
        className={styles.dots}
        role="progressbar"
        aria-label={`${item.display_name} growth`}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={units}
        aria-valuetext={bloomed ? "In bloom" : `${units} of ${target} growth`}
      >
        {Array.from({ length: target }, (_, index) => (
          <i key={index} data-filled={index < units || undefined} />
        ))}
      </div>
      {!bloomed && (
        <p className={styles.quiet}>
          {item.type_key === "peony"
            ? "It grows by one each time you finish a milestone together. Nothing is ever lost."
            : "It grows by one when you both care on the same garden day. Nothing is ever lost."}
        </p>
      )}
    </section>
  );
}

/** Who has cared for this flower today, and the one cue that matters. */
function Today({ plant, item, state }: { plant: Plant; item: CatalogItem; state: GardenState }) {
  const partner = usePartnerName();
  const status = gardenCareStatus(plant, item, state);
  if (!status) return null;
  const cue = sheetCue(status, partner.subject);
  return (
    <section className={styles.today} aria-label="Who has cared today">
      <ul className={styles.cared}>
        <li data-who="you" data-cared={status.you || undefined}>
          <span aria-hidden="true">{status.you ? "✿" : "·"}</span> you {status.you ? "cared today" : status.later ? "· opens at 10 p.m." : "· not yet"}
        </li>
        <li data-who="partner" data-cared={status.partner || undefined}>
          <span aria-hidden="true">{status.partner ? "✿" : "·"}</span> {partner.short} {status.partner ? "cared today" : status.later ? "· opens at 10 p.m." : "· not yet"}
        </li>
      </ul>
      {cue && <p className={styles.cue}>{cue}</p>}
    </section>
  );
}

function DaisyQuestion({ plant }: { plant: Plant }) {
  const question = plant.daisy_question;
  if (plant.flower.type_key !== "daisy" || !question) return null;
  return (
    <section className={styles.callout} aria-label="Question of the day">
      <p className={styles.calloutLabel}>today’s {question.category === "light" ? "light" : "deeper"} question</p>
      <p className={styles.question}>{question.prompt}</p>
    </section>
  );
}

/** The Hydrangea's colours: each member's latest pick and today's blend. */
function HydrangeaColors({ plant, state }: { plant: Plant; state: GardenState }) {
  const partner = usePartnerName();
  if (plant.flower.type_key !== "hydrangea") return null;
  const mine = plant.hydrangea_picks[state.member_id - 1];
  const theirs = plant.hydrangea_picks[state.member_id === 1 ? 1 : 0];
  const blendA = mine && moodBlend(mine);
  const blendB = theirs && moodBlend(theirs);
  return (
    <section className={styles.callout} aria-label="Color of the day">
      <p className={styles.calloutLabel}>color of the day</p>
      {mine || theirs ? (
        <>
          <ul className={styles.colorPair}>
            <li>
              <span className={styles.who}>you</span> {mine ? <MoodChip pick={mine} /> : <span className={styles.quiet}>no color yet</span>}
            </li>
            <li>
              <span className={styles.who}>{partner.short}</span> {theirs ? <MoodChip pick={theirs} /> : <span className={styles.quiet}>no color yet</span>}
            </li>
          </ul>
          {mine && theirs && (
            <div
              className={styles.blend}
              role="img"
              aria-label={`Together today: ${moodLabel(mine)} and ${moodLabel(theirs)}`}
              style={{
                background: `linear-gradient(90deg, ${blendA ?? "#d9d2c2"}, ${blendB ?? "#d9d2c2"})`,
              }}
            />
          )}
          <p className={styles.quiet}>The hydrangea’s florets take your colors.</p>
        </>
      ) : (
        <p className={styles.quiet}>Pick a color below and the hydrangea takes it on.</p>
      )}
    </section>
  );
}

/** The Dandelion's shared wish, and blowing its seeds once it has bloomed. */
function DandelionWish({ plant, state, busy, mutate }: { plant: Plant; state: GardenState; busy: boolean; mutate: MutateV2 }) {
  const partner = usePartnerName();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const flower = plant.flower;
  if (flower.type_key !== "dandelion") return null;
  async function fulfill() {
    if (lock.current || busy) return;
    lock.current = true;
    setError(null);
    try {
      const result = await mutate({ kind: "fulfillDandelion", flowerId: flower.id });
      if (!result.saved) setError(result.error ?? "Check this wish before trying again.");
      else setConfirming(false);
    } finally {
      lock.current = false;
    }
  }
  return (
    <section className={styles.callout} aria-label="Our shared wish">
      <p className={styles.calloutLabel}>our wish</p>
      <p className={styles.question}>{flower.shared_wish}</p>
      {flower.fulfilled_at ? (
        <p role="status">
          {flower.fulfilled_by === state.member_id ? "You" : partner.subject} blew the seeds on {gardenDate(flower.fulfilled_at)}. The wish came
          true, and this dandelion stays as a keepsake.
        </p>
      ) : !flower.first_bloom_at ? (
        <p className={styles.quiet}>Once it blooms and goes to seed, you can blow the seeds when the wish comes true.</p>
      ) : confirming ? (
        <div className={styles.confirm}>
          <p>Has your wish come true? Blowing the seeds marks it fulfilled for good. The dandelion stays with all its memories. This can’t be undone.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void fulfill()}>
              blow the seeds
            </button>
            <button type="button" className={styles.textButton} disabled={busy} onClick={() => setConfirming(false)}>
              keep waiting
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => setConfirming(true)}>
          our wish came true
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Card({ who, title, children }: { who: "you" | "partner"; title: string; children: ReactNode }) {
  return (
    <article className={styles.card} data-who={who} aria-label={title}>
      <h3 className={styles.cardTitle}>{title}</h3>
      {children}
    </article>
  );
}

type HistoryPage = { day: string; entries: Entry[]; more: boolean };

/** Earlier days of this flower, oldest pages on demand. */
function History({ plant, state, type }: { plant: Plant; state: GardenState; type: string }) {
  const partner = usePartnerName();
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  // A rollover moves today's entries into history: reread from the start.
  const current = page?.day === state.garden_day ? page : null;
  async function read() {
    if (lock.current) return;
    lock.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await loadFlowerHistoryV2(plant.flower.id, current?.entries.at(-1)?.id ?? null);
      setError(result.error);
      if (!result.error)
        setPage((old) => {
          const previous = old?.day === state.garden_day ? old.entries : [];
          const fresh = result.entries.filter((entry) => !previous.some((prior) => prior.id === entry.id));
          return { day: state.garden_day, entries: [...previous, ...fresh], more: result.entries.length === 20 };
        });
    } finally {
      lock.current = false;
      setLoading(false);
    }
  }
  const earlier = current?.entries.filter((entry) => entry.garden_day !== state.garden_day) ?? null;
  return (
    <section className={styles.history} aria-label="History">
      <h3 className={styles.sectionTitle}>earlier days</h3>
      {earlier?.length === 0 && !current?.more && <p className={styles.quiet}>No earlier days yet.</p>}
      {earlier && earlier.length > 0 && (
        <ol className={styles.historyList}>
          {earlier.map((entry) => (
            <li key={entry.id} className={styles.historyEntry}>
              <p className={styles.meta}>
                <strong>{entry.author_id === state.member_id ? "you" : partner.short}</strong> ·{" "}
                <time dateTime={entry.original_posted_at}>
                  {gardenDayLabel(entry.garden_day)}, {gardenTime(entry.original_posted_at)}
                </time>
              </p>
              <EntryContent entry={entry} type={type} />
              <div className={styles.replies}>
                <EntryReplies entryId={entry.id} authorId={entry.author_id} memberId={state.member_id} refreshKey={state.server_now} actions={v2Replies} />
              </div>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {(current === null || current.more) && (
        <button type="button" className={styles.secondary} disabled={loading} onClick={() => void read()}>
          {loading ? "reading…" : current === null ? "read earlier days" : "older"}
        </button>
      )}
    </section>
  );
}

export interface FlowerPanelProps {
  plant: Plant;
  state: GardenState;
  item: CatalogItem;
  now: number;
  busy: boolean;
  mutate: MutateV2;
  /** Opens another flower (e.g. the next one waiting for your care). */
  onVisit?: (flowerId: string) => void;
}

/** The right half of a flower's view: its activity, today's care, the partner's entry and history. */
export function FlowerPanel({ plant, state, item, now, busy, mutate, onVisit }: FlowerPanelProps) {
  const partner = usePartnerName();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [saved, setSaved] = useState<"share" | "edit" | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const flower = plant.flower;
  const type = flower.type_key;
  const media = type === "sunflower" || type === "bluebell";
  const MediaCare = type === "bluebell" ? VoiceCare : PhotoCare;
  const bloomed = flower.first_bloom_at !== null;
  const optionalMood = type === "hydrangea" && bloomed;
  // Bloomed flowers are complete, except the Cactus (check-ins continue) and the Hydrangea (optional colors).
  const dailyCare = !flower.fulfilled_at && (!bloomed || type === "cactus" || type === "hydrangea");
  const mine = plant.entries.find((entry) => entry.author_id === state.member_id);
  const theirs = plant.entries.find((entry) => entry.author_id !== state.member_id);
  const moonClosed = type === "moonflower" && !state.moonflower_open;
  const theirsCared = state.member_id === 1 ? plant.member2_submitted : plant.member1_submitted;

  const plan = saved === "share" && !optionalMood ? gardenTodayPlan(state) : null;
  const next = plan?.rows.find((row) => row.dueForYou && row.plant.flower.id !== flower.id) ?? null;
  useEffect(() => {
    if (saved === "share") nextRef.current?.focus({ preventScroll: false });
  }, [saved]);

  if (type === "peony")
    return (
      <div className={styles.panelBody}>
        <Growth plant={plant} item={item} />
        <PeonyMilestones flowerId={flower.id} refreshKey={state.server_now} now={now} busy={busy} mutate={mutate} />
      </div>
    );

  const myEntry = (entry: Entry) => (
    <div className={styles.entry}>
      <p className={styles.meta}>
        <time dateTime={entry.original_posted_at}>{gardenTime(entry.original_posted_at)}</time>
        {entry.updated_at !== entry.original_posted_at && " · edited"}
      </p>
      {editing?.id === entry.id ? (
        media ? (
          <MediaCare
            key={entry.id}
            {...{ plant, state, now, busy, mutate }}
            editing={entry}
            onSaved={() => {
              setEditing(null);
              setSaved("edit");
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <CareForm
            key={entry.id}
            {...{ plant, state, item, now, busy, mutate }}
            editing={entry}
            onSaved={() => {
              setEditing(null);
              setSaved("edit");
            }}
            onCancel={() => setEditing(null)}
          />
        )
      ) : (
        <>
          <EntryContent entry={entry} type={type} />
          {canEditAt(entry, state, now) ? (
            <p className={styles.editRow}>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  setEditing(entry);
                  setSaved(null);
                }}
              >
                {type === "sunflower" ? "replace photo" : type === "bluebell" ? "record again" : "edit"}
              </button>
              <small>
                until {gardenTime(entry.edit_deadline!)} · the original time stays
              </small>
            </p>
          ) : (
            <p className={styles.quiet}>Edit window ended.</p>
          )}
        </>
      )}
      <div className={styles.replies}>
        <EntryReplies entryId={entry.id} authorId={entry.author_id} memberId={state.member_id} refreshKey={state.server_now} actions={v2Replies} />
      </div>
    </div>
  );

  const youCard = (
    <Card who="you" title="You">
      {mine ? (
        myEntry(mine)
      ) : dailyCare && media ? (
        <MediaCare {...{ plant, state, now, busy, mutate }} onSaved={() => setSaved("share")} />
      ) : dailyCare ? (
        <CareForm
          {...{ plant, state, item, now, busy, mutate }}
          unavailable={moonClosed ? MOONFLOWER_CLOSED : undefined}
          onSaved={() => setSaved("share")}
        />
      ) : null}
    </Card>
  );
  const partnerCard = (
    <Card who="partner" title={partner.label}>
      {theirs ? (
        <div className={styles.entry}>
          <p className={styles.meta}>
            <time dateTime={theirs.original_posted_at}>{gardenTime(theirs.original_posted_at)}</time>
            {theirs.updated_at !== theirs.original_posted_at && " · edited"}
          </p>
          <EntryContent entry={theirs} type={type} />
          <div className={styles.replies}>
            <EntryReplies entryId={theirs.id} authorId={theirs.author_id} memberId={state.member_id} refreshKey={state.server_now} actions={v2Replies} />
          </div>
        </div>
      ) : (
        <p className={styles.quiet}>
          {theirsCared ? "Shared today." : optionalMood ? `${partner.possessiveLabel} color shows here if they pick one today.` : `${partner.possessiveLabel} care shows up here as soon as they share.`}
        </p>
      )}
    </Card>
  );

  return (
    <div className={styles.panelBody}>
      <Growth plant={plant} item={item} />
      <Today plant={plant} item={item} state={state} />
      <DaisyQuestion plant={plant} />
      <HydrangeaColors plant={plant} state={state} />
      <DandelionWish plant={plant} state={state} busy={busy} mutate={mutate} />
      {dailyCare ? (
        <section className={styles.cards} aria-label="Today">
          <h3 className={styles.sectionTitle}>today · {gardenDayLabel(state.garden_day)}</h3>
          {/* Your partner's card leads once it has something to show; otherwise yours, with the form. */}
          {theirs || theirsCared ? (
            <>
              {partnerCard}
              {youCard}
            </>
          ) : (
            <>
              {youCard}
              {partnerCard}
            </>
          )}
        </section>
      ) : (
        <>
          <p className={styles.quiet}>{flower.fulfilled_at ? "Its wish came true." : "It has bloomed for good."} No more daily care is needed; its memories stay here.</p>
          {(theirs || mine) && (
            <section className={styles.cards} aria-label="Today">
              <h3 className={styles.sectionTitle}>today · {gardenDayLabel(state.garden_day)}</h3>
              {theirs && partnerCard}
              {mine && youCard}
            </section>
          )}
        </>
      )}
      {saved && (
        <div className={styles.saved}>
          <p role="status">
            Saved. {partner.subject} can see it now.
          </p>
          {next && onVisit && (
            <button ref={nextRef} type="button" className={styles.secondary} onClick={() => onVisit(next.plant.flower.id)}>
              next: {next.item.display_name.toLowerCase()} <span aria-hidden="true">→</span>
            </button>
          )}
          {saved === "share" && !next && !optionalMood && <p className={styles.quiet}>That’s everything for today ✿</p>}
        </div>
      )}
      <History plant={plant} state={state} type={type} />
    </div>
  );
}

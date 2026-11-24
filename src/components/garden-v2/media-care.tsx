"use client";
import { useEffect, useRef } from "react";
import { usePartnerName } from "@/components/auth/member-names";
import { PhotoViewer } from "@/components/media/photo-viewer";
import { VoicePlayer, VoiceViewer } from "@/components/media/voice-player";
import { photoAccept, type MediaStage } from "@/lib/media/browser";
import { usePhotoDraft } from "@/lib/media/use-photo-draft";
import { useVoiceDraft } from "@/lib/media/use-voice-draft";
import { voiceTime } from "@/lib/media/use-voice-recorder";
import { canEditAt, type Entry, type GardenState, type Plant } from "@/lib/garden-v2/model";
import type { MutateV2 } from "./care-form";
import styles from "./garden-v2.module.css";

type MediaCareProps = {
  plant: Plant;
  state: GardenState;
  now: number;
  busy: boolean;
  mutate: MutateV2;
  editing?: Entry | null;
  onSaved: () => void;
  onCancel?: () => void;
};

const STAGES: readonly MediaStage[] = ["reserving", "uploading", "checking"];
const STAGE_WORDS: Record<MediaStage, string> = {
  reserving: "making a private space…",
  uploading: "sending…",
  checking: "checking it privately…",
};

/**
 * Where a save is, as a painted bar in three steps. The Storage client reports
 * no byte progress, so the sending step breathes until the server's check.
 */
function SaveProgress({ stage, what }: { stage: MediaStage | null; what: string }) {
  const step = stage ? STAGES.indexOf(stage) + 1 : 0;
  const words = stage ? STAGE_WORDS[stage] : "getting ready…";
  return (
    <div className={styles.progress}>
      <div
        className={styles.progressBar}
        role="progressbar"
        aria-label={`Sharing your ${what}`}
        aria-valuemin={0}
        aria-valuemax={STAGES.length}
        aria-valuenow={step}
        aria-valuetext={`${what[0]!.toUpperCase()}${what.slice(1)}: ${words}`}
        data-stage={stage ?? "starting"}
      >
        <i style={{ width: `${[6, 18, 62, 88][step]}%` }} />
      </div>
      <p className={styles.progressWords} aria-hidden="true">
        {words}
      </p>
    </div>
  );
}

/** Notes shared by both media forms: rollover, a new day's review, an ended edit window. */
function DayNotes({
  boundary,
  newDay,
  editing,
  expired,
  what,
  onKeep,
  pending,
}: {
  boundary: boolean;
  newDay: boolean;
  editing: boolean;
  expired: boolean;
  what: string;
  onKeep: () => void;
  pending: boolean;
}) {
  return (
    <>
      {boundary && (
        <p className={styles.note} role="status">
          A new garden day is starting. Your {what} stays here; review it after the garden refreshes.
        </p>
      )}
      {newDay && !editing && !boundary && (
        <div className={styles.note} role="status">
          <p>A new garden day has begun. Review this {what} before sharing it today.</p>
          <button type="button" className={styles.textButton} disabled={pending} onClick={onKeep}>
            use this {what} today
          </button>
        </div>
      )}
      {expired && (
        <p className={styles.note} role="status">
          The edit window has ended. Your shared {what} is unchanged.
        </p>
      )}
    </>
  );
}

/**
 * The Sunflower's photo: choose or take one, look at it here first (it never
 * leaves the device until you share), then share it privately with progress.
 */
export function PhotoCare({ plant, state, now, busy, mutate, editing, onSaved, onCancel }: MediaCareProps) {
  const partner = usePartnerName();
  const expired = !!editing && !canEditAt(editing, state, now);
  const draft = usePhotoDraft({
    flowerId: plant.flower.id,
    gardenDay: state.garden_day,
    nextRolloverAt: state.next_rollover_at,
    now,
    busy,
    mutate,
    editingId: editing?.id,
    expired,
    onSaved,
    garden: "v2",
  });
  const { file, preview, pending } = draft;
  const disabled = pending || busy;
  return (
    <form
      className={styles.form}
      aria-label={editing ? "Replace your photo" : "Share a Sunflower photo"}
      aria-busy={pending}
      onSubmit={(event) => void draft.submit(event)}
    >
      {!file && (
        <>
          <div className={styles.pickers}>
            <label className={`${styles.secondary} ${styles.picker}`} data-disabled={disabled || undefined}>
              <input className={styles.fileInput} type="file" accept={photoAccept} onChange={draft.choose} disabled={disabled} />
              choose a photo
            </label>
            <label className={`${styles.secondary} ${styles.picker}`} data-disabled={disabled || undefined}>
              <input
                className={styles.fileInput}
                type="file"
                accept={photoAccept}
                capture="environment"
                onChange={draft.choose}
                disabled={disabled}
              />
              take a photo
            </label>
          </div>
          <p className={styles.formHint}>
            JPEG, PNG or still WebP, up to 12 MiB. Never cropped or shrunk; its location is removed. HEIC? Export it as a JPEG first.
          </p>
        </>
      )}
      {file && preview && (
        <figure className={styles.mediaReview}>
          <div className={styles.photoFrame}>
            {/* A local preview: it stays on this device until you share. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={preview} src={preview} alt="Your photo preview" onLoad={draft.markPreviewReady} onError={draft.previewFailed} />
          </div>
          <figcaption className={styles.formHint}>
            {file.name} · only you can see it until you share. {partner.subject} sees it as soon as you do.
          </figcaption>
          {!pending && (
            <button type="button" className={styles.textButton} onClick={draft.remove}>
              choose another
            </button>
          )}
        </figure>
      )}
      {pending && <SaveProgress stage={draft.stage} what="photo" />}
      <DayNotes
        boundary={draft.boundary}
        newDay={draft.newDay}
        editing={!!editing}
        expired={expired}
        what="photo"
        onKeep={draft.keepForToday}
        pending={pending}
      />
      {draft.error && (
        <p className={styles.error} role="alert">
          {draft.error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={!draft.canSubmit}>
          {pending ? "sharing…" : editing ? "save new photo" : "share photo"}
        </button>
        {editing && (
          <button type="button" className={styles.textButton} disabled={pending} onClick={onCancel}>
            cancel
          </button>
        )}
      </div>
    </form>
  );
}

const METER_BARS = 24;

/**
 * A live level meter for the microphone while recording. It listens only on
 * this device (Web Audio, nothing is sent) and is decorative: the status line
 * says what is happening.
 */
function LevelMeter({ stream, live }: { stream: MediaStream | null; live: boolean }) {
  const bars = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = bars.current;
    if (!root || !stream || !live || typeof AudioContext === "undefined") return;
    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch {
      return;
    }
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    let source: MediaStreamAudioSourceNode | null = null;
    try {
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch {
      void context.close().catch(() => {});
      return;
    }
    void context.resume().catch(() => {});
    const samples = new Float32Array(analyser.fftSize);
    const history = new Array<number>(METER_BARS).fill(0);
    const nodes = Array.from(root.children) as HTMLElement[];
    let frame = 0;
    let last = 0;
    let level = 0;
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      if (time - last < 70) return;
      last = time;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) sum += value * value;
      // RMS on a soft log scale: quiet speech still moves the meter.
      const rms = Math.sqrt(sum / samples.length);
      const target = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-6) + 54) / 48));
      level = target > level ? target : level * 0.6 + target * 0.4;
      history.shift();
      history.push(level);
      nodes.forEach((node, index) => node.style.setProperty("--level", history[index]!.toFixed(3)));
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      source?.disconnect();
      void context.close().catch(() => {});
      nodes.forEach((node) => node.style.removeProperty("--level"));
    };
  }, [stream, live]);
  return (
    <span ref={bars} className={styles.meter} data-live={live || undefined} aria-hidden="true">
      {Array.from({ length: METER_BARS }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

/**
 * The Bluebell's voice memo: the microphone turns on only after "record",
 * a level meter shows it is listening, then you listen back and share it.
 */
export function VoiceCare({ plant, state, now, busy, mutate, editing, onSaved, onCancel }: MediaCareProps) {
  const partner = usePartnerName();
  const expired = !!editing && !canEditAt(editing, state, now);
  const draft = useVoiceDraft({
    flowerId: plant.flower.id,
    gardenDay: state.garden_day,
    nextRolloverAt: state.next_rollover_at,
    now,
    busy,
    mutate,
    editingId: editing?.id,
    expired,
    onSaved,
    garden: "v2",
  });
  const { recorder, active, pending } = draft;
  const { recordButton, stopButton, resumeButton, reviewHeading } = draft.refs;
  const phase = recorder.phase;
  const recording = phase === "recording" || phase === "paused";
  return (
    <form
      className={styles.form}
      aria-label={editing ? "Replace your voice memo" : "Share a Bluebell voice memo"}
      aria-busy={pending}
      onSubmit={(event) => void draft.submit(event)}
    >
      <p className={styles.formHint}>
        Up to five minutes. The microphone turns on only when you tap record, and nothing is shared until you choose to.
      </p>
      <p className={styles.recStatus} role="status" data-phase={phase}>
        {phase === "requesting"
          ? "waiting for the microphone…"
          : phase === "recording"
            ? "recording · it stops by itself at five minutes"
            : phase === "paused"
              ? "paused · paused time doesn’t count"
              : phase === "stopping"
                ? "finishing…"
                : phase === "review"
                  ? "recorded · not shared yet"
                  : "microphone off"}
      </p>
      {(recording || phase === "stopping") && (
        <div className={styles.recorder}>
          <LevelMeter stream={recorder.stream ?? null} live={phase === "recording"} />
          <p className={styles.clock} aria-label={`Recorded time ${voiceTime(recorder.elapsedMs)}`}>
            {voiceTime(recorder.elapsedMs)} <span>/ 5:00</span>
          </p>
        </div>
      )}
      <div className={styles.actions}>
        {!active && phase !== "requesting" && (
          <button
            ref={recordButton}
            type="button"
            className={phase === "review" ? styles.secondary : styles.primary}
            disabled={pending || busy || expired || draft.boundary}
            onClick={draft.start}
          >
            <span className={styles.recDot} aria-hidden="true" />
            {phase === "review" ? "record again" : "record"}
          </button>
        )}
        {phase === "recording" && recorder.canPause && (
          <button type="button" className={styles.secondary} onClick={recorder.pause}>
            pause
          </button>
        )}
        {phase === "paused" && (
          <button ref={resumeButton} type="button" className={styles.secondary} onClick={recorder.resume}>
            resume
          </button>
        )}
        {recording && (
          <button ref={stopButton} type="button" className={styles.primary} onClick={recorder.stop}>
            stop and listen
          </button>
        )}
        {phase !== "idle" && (
          <button type="button" className={styles.textButton} disabled={pending} onClick={draft.discard}>
            {phase === "requesting" ? "cancel" : "throw it away"}
          </button>
        )}
      </div>
      {recorder.file && recorder.preview && (
        <div className={styles.mediaReview}>
          <h4 ref={reviewHeading} className={styles.reviewTitle} tabIndex={-1}>
            listen back · {voiceTime(recorder.elapsedMs)}
          </h4>
          <div className={styles.audio}>
            <VoicePlayer key={recorder.preview} source={recorder.preview} label="Your voice memo preview" onReady={draft.markReady} onError={draft.previewFailed} />
          </div>
          <p className={styles.formHint}>Only you can hear it until you share. {partner.subject} can listen as soon as you do.</p>
          {recorder.elapsedMs > 300000 && (
            <p className={styles.note} role="status">
              Your browser was slow to stop. The server checks the whole recording and may refuse it if it is over five minutes; it never shortens your memo.
            </p>
          )}
        </div>
      )}
      {pending && <SaveProgress stage={draft.stage} what="memo" />}
      <DayNotes
        boundary={draft.boundary}
        newDay={draft.newDay && !!recorder.file}
        editing={!!editing}
        expired={expired}
        what="memo"
        onKeep={draft.keepForToday}
        pending={pending}
      />
      {(draft.error || recorder.error) && (
        <p className={styles.error} role="alert">
          {draft.error ?? recorder.error}
        </p>
      )}
      {(recorder.file || pending || editing) && (
        <div className={styles.actions}>
          {(recorder.file || pending) && (
            <button type="submit" className={styles.primary} disabled={!draft.canSubmit}>
              {pending ? "sharing…" : editing ? "save new memo" : "share memo"}
            </button>
          )}
          {editing && (
            <button type="button" className={styles.textButton} disabled={pending} onClick={onCancel}>
              cancel
            </button>
          )}
        </div>
      )}
    </form>
  );
}

/** A shared photo, read through a fresh short-lived private link. */
export function PhotoEntry({ mediaId }: { mediaId: string }) {
  return <PhotoViewer key={mediaId} mediaId={mediaId} garden="v2" frameClassName={styles.photoFrame} />;
}

/** A shared voice memo; its private link is requested only when you choose to listen. */
export function VoiceEntry({ mediaId }: { mediaId: string }) {
  return (
    <div className={styles.audio}>
      <VoiceViewer mediaId={mediaId} garden="v2" />
    </div>
  );
}

"use client";
import { useRef, useState } from "react";
import type { Plant } from "@/lib/garden/model";
import type { Mutate } from "./seed-picker";
import styles from "./garden.module.css";

export function DandelionWish({ flower, memberId, busy, mutate }: {
  flower: Plant["flower"]; memberId: 1 | 2; busy: boolean; mutate: Mutate;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  if (flower.type_key !== "dandelion") return null;
  async function fulfill() {
    if (lock.current || busy) return;
    lock.current = true;
    setError(null);
    try {
      const result = await mutate({ kind: "fulfillDandelion", flowerId: flower.id });
      if (!result.saved) setError(result.error ?? "Check this wish before trying again.");
      else setConfirming(false);
    } catch { setError("We could not confirm fulfillment. Refresh and check this wish before trying again."); }
    finally { lock.current = false; }
  }
  return <section className={styles.notice} aria-label="Our shared wish">
    <span className="eyebrow">OUR SHARED WISH</span>
    <p className={styles.entryText}>{flower.shared_wish}</p>
    {flower.fulfilled_at ? <p role="status">
      {flower.fulfilled_by === memberId ? "You fulfilled" : "Your partner fulfilled"} this wish · <time dateTime={flower.fulfilled_at}>{new Intl.DateTimeFormat("en-US", { timeZone:"America/Los_Angeles", dateStyle:"medium", timeStyle:"short" }).format(new Date(flower.fulfilled_at))} Pacific</time>.
      {" "}Seeds scattered. Your wish and its memories stay here.
    </p> : flower.first_bloom_at ? confirming ? <div className={styles.stack}>
      <p>Has your shared wish come true? Blowing the seeds marks it fulfilled permanently. This flower stays as a permanent keepsake with all its memories. Seeds are decorative and create no new plants. This cannot be undone.</p>
      <button className="button" disabled={busy} onClick={()=>void fulfill()}>Confirm and blow seeds</button>
      <button className="button button-secondary" disabled={busy} onClick={()=>setConfirming(false)}>Keep waiting</button>
    </div> : <button className="button" disabled={busy} onClick={()=>setConfirming(true)}>Fulfill our wish</button> : <p>Your wish can be fulfilled after this Dandelion blooms.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

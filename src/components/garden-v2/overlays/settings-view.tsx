"use client";
import Link from "next/link";
import type { Ref } from "react";
import { useMemberPreferences } from "@/components/settings/member-preferences";
import { legacyPath } from "@/lib/legacy/routes";
import v2 from "../garden-v2.module.css";
import styles from "./overlays.module.css";

/**
 * Settings for the new garden. Member settings are shared with the old garden
 * (one row per member); the private moment's owner controls appear in
 * `ownerRef` exactly as in the old garden's Settings, and the old garden is
 * one link away.
 */
export function SettingsView({ ownerRef, onGuide }: { ownerRef: Ref<HTMLDivElement>; onGuide: () => void }) {
  const preferences = useMemberPreferences();
  const state = preferences?.state ?? null;
  const busy = !preferences || preferences.busy || !state;
  return (
    <div className={styles.stack}>
      <section className={styles.group} aria-labelledby="settings-garden">
        <h3 id="settings-garden" className={styles.groupTitle}>
          the garden
        </h3>
        <div className={styles.row}>
          <div>
            <h4 className={styles.rowTitle}>a little guide</h4>
            <p className={styles.rowCopy}>Walk through how the garden works again.</p>
          </div>
          <button type="button" className={v2.secondary} onClick={onGuide}>
            replay the guide
          </button>
        </div>
        <div className={styles.row}>
          <div>
            <h4 className={styles.rowTitle}>garden day</h4>
            <p className={styles.rowCopy}>
              A new garden day begins at 4 a.m. Pacific, wherever you are. A flower grows when you both care for it on the
              same garden day, and nothing is ever lost.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.group} aria-labelledby="settings-comfort">
        <h3 id="settings-comfort" className={styles.groupTitle}>
          comfort
        </h3>
        <div className={styles.row}>
          <div>
            <h4 className={styles.rowTitle}>gentle motion</h4>
            <p className={styles.rowCopy}>
              Softly drifting words and fades. Shared with the old garden; your device’s reduced motion setting always wins.
            </p>
          </div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={state?.gentle_motion ?? false}
              disabled={busy}
              onChange={(event) => void preferences?.save({ gentle_motion: event.target.checked })}
            />
            <span>Allow gentle motion</span>
          </label>
        </div>
        {(preferences?.error || !preferences) && (
          <div className={v2.error} role="alert">
            <p>{preferences?.error ?? "Your settings could not load. Please try again."}</p>
            {preferences && (
              <button type="button" className={v2.textButton} disabled={preferences.busy} onClick={() => void preferences.refresh()}>
                refresh settings
              </button>
            )}
          </div>
        )}
      </section>

      {/* The private moment's owner controls render here, unchanged (decision 0020). */}
      <div ref={ownerRef} className={styles.owner} />

      <section className={styles.group} aria-labelledby="settings-old">
        <h3 id="settings-old" className={styles.groupTitle}>
          the old garden
        </h3>
        <div className={styles.row}>
          <p className={styles.rowCopy}>Our first garden is kept safe as a keepsake: everything is there to browse, and nothing changes.</p>
          <Link href={legacyPath} className={v2.primary}>
            visit the old garden
          </Link>
        </div>
      </section>

      <section className={styles.group} aria-labelledby="settings-account">
        <h3 id="settings-account" className={styles.groupTitle}>
          account
        </h3>
        <div className={styles.row}>
          <p className={styles.rowCopy}>Leave the garden on this device.</p>
          <form action="/auth/sign-out" method="post">
            <button type="submit" className={v2.secondary}>
              sign out
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

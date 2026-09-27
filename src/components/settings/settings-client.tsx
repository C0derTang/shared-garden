"use client";
import { useRouter } from "next/navigation";
import { useMemberPreferences } from "./member-preferences";
import styles from "./settings.module.css";
// The route panel title is the h2, so settings groups start at h3 (decision 0055).
export function SettingsClient() {
  const preferences = useMemberPreferences();
  const router = useRouter();
  if (!preferences) return null;
  return <div className={styles.page}>
    <section className={styles.settings} aria-label="Personal settings">
      <div className={styles.group} role="group" aria-labelledby="settings-garden">
        <h3 id="settings-garden" className={styles.groupTitle}>Garden</h3>
        <div className={`${styles.row} ${styles.actionRow}`}>
          <div className={styles.copy}>
            <h4>Garden guide</h4>
            <p>Replay the short garden tour.</p>
          </div>
          <button className="button button-primary" type="button" disabled={preferences.busy || !preferences.state} onClick={async () => { if (await preferences.save({ guide: "open" })) router.push("/garden"); }}>Reopen garden guide</button>
        </div>
        <details className={styles.details}>
          <summary>Garden day · 4 a.m. Pacific</summary>
          <p>This rollover applies wherever you are. The Garden clock shows how much time is left to share today’s care.</p>
        </details>
      </div>
      <div className={styles.group} role="group" aria-labelledby="settings-comfort">
        <h3 id="settings-comfort" className={styles.groupTitle}>Comfort</h3>
        <div className={`${styles.row} ${styles.actionRow}`}>
          <div className={styles.copy}>
            <h4>Gentle motion</h4>
            <p>Your device’s reduced motion setting always wins.</p>
          </div>
          <label className={styles.preference}><input type="checkbox" className={styles.toggle} checked={preferences.state?.gentle_motion ?? false} disabled={preferences.busy || !preferences.state} onChange={(event) => void preferences.save({ gentle_motion: event.target.checked })} />Allow gentle motion</label>
        </div>
      </div>
      {preferences.error && <div className={styles.alert} role="alert"><p>{preferences.error}</p><button type="button" className="button button-secondary" disabled={preferences.busy} onClick={() => void preferences.refresh()}>Refresh settings</button></div>}
      <div className={styles.group} role="group" aria-labelledby="settings-account">
        <h3 id="settings-account" className={styles.groupTitle}>Account</h3>
        <div className={`${styles.row} ${styles.actionRow}`}>
          <p className={styles.copy}>Leave the garden on this device.</p>
          <form action="/auth/sign-out" method="post"><button type="submit" className="button button-secondary">Sign out</button></form>
        </div>
      </div>
    </section>
  </div>;
}

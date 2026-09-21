"use client";
import { useRouter } from "next/navigation";
import { useMemberPreferences } from "./member-preferences";
import styles from "./settings.module.css";
export function SettingsClient() {
  const preferences = useMemberPreferences();
  const router = useRouter();
  if (!preferences) return null;
  return <div className={styles.page}>
    <section className={styles.settings} aria-label="Personal settings">
      <div className={`${styles.row} ${styles.actionRow}`}>
        <div className={styles.copy}>
          <h2>Garden guide</h2>
          <p>Replay the short garden tour.</p>
        </div>
        <button className="button button-primary" type="button" disabled={preferences.busy || !preferences.state} onClick={async () => { if (await preferences.save({ guide: "open" })) router.push("/garden"); }}>Reopen garden guide</button>
      </div>
      <div className={`${styles.row} ${styles.motionRow}`}>
        <div className={styles.copy}>
          <h2>Gentle motion</h2>
          <p>Your device’s reduced motion setting always wins.</p>
        </div>
        <label className={styles.preference}><input type="checkbox" checked={preferences.state?.gentle_motion ?? false} disabled={preferences.busy || !preferences.state} onChange={(event) => void preferences.save({ gentle_motion: event.target.checked })} />Allow gentle motion</label>
      </div>
      <details className={styles.details}>
        <summary>Garden day · 4 a.m. Pacific</summary>
        <p>This rollover applies wherever you are. The Garden clock shows how much time is left to share today’s care.</p>
      </details>
      {preferences.error && <div className={styles.alert} role="alert"><p>{preferences.error}</p><button type="button" className="button button-secondary" disabled={preferences.busy} onClick={() => void preferences.refresh()}>Refresh settings</button></div>}
      <div className={`${styles.row} ${styles.accountRow}`}>
        <h2>Account</h2>
        <form action="/auth/sign-out" method="post"><button type="submit" className="button button-secondary">Sign out</button></form>
      </div>
    </section>
  </div>;
}

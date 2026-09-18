"use client";
import { useRouter } from "next/navigation";
import { useMemberPreferences } from "./member-preferences";
import styles from "./settings.module.css";
export function SettingsClient() {
  const preferences = useMemberPreferences();
  const router = useRouter();
  if (!preferences) return null;
  return <div className={styles.page}>
    <header><p className="eyebrow">MAKE YOURSELF AT HOME</p><h1>Garden settings</h1><p>A few small choices, just for you.</p></header>
    <section className={styles.card} aria-labelledby="guide-heading">
      <h2 id="guide-heading">Find your way around</h2>
      <p>The garden guide follows the care you have already shared. Reopening it keeps every flower and memory just as they are.</p>
      <button className="button button-primary" type="button" disabled={preferences.busy || !preferences.state} onClick={async () => { if (await preferences.save({ guide: "open" })) router.push("/garden"); }}>Reopen garden guide</button>
    </section>
    <section className={styles.card} aria-labelledby="motion-heading">
      <h2 id="motion-heading">A quieter garden</h2>
      <label className={styles.preference}><input type="checkbox" checked={preferences.state?.gentle_motion ?? false} disabled={preferences.busy || !preferences.state} onChange={(event) => void preferences.save({ gentle_motion: event.target.checked })} />Allow gentle motion</label>
      <p className={styles.quiet}>Your device’s reduced motion setting always comes first. Flowers and scattered seeds stay visible with motion off.</p>
    </section>
    <section className={styles.card} aria-labelledby="clock-heading">
      <h2 id="clock-heading">One shared garden day</h2>
      <p>A new garden day begins at 4 a.m. Pacific time, wherever you are. The Garden clock shows how much time is left to share today’s care.</p>
    </section>
    {preferences.error && <div role="alert"><p>{preferences.error}</p><button type="button" className="button button-secondary" disabled={preferences.busy} onClick={() => void preferences.refresh()}>Refresh settings</button></div>}
    <form action="/auth/sign-out" method="post"><button type="submit" className="button button-secondary">Sign out</button></form>
  </div>;
}

import type { LandingData } from "@/lib/landing/types";
import { MemberScene } from "./member-scene";
import styles from "./sunset-home.module.css";

export function SunsetLanding({ data }: { data: LandingData }) {
  if (data.status === "visitor") return (
    <main id="main-content" className={styles.entrance}>
      <form action="/auth/start" method="post">
        <button type="submit" className={styles.login}>Log in</button>
      </form>
    </main>
  );
  return <MemberScene />;
}

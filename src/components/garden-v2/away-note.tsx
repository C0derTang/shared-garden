"use client";
import { usePartnerName } from "@/components/auth/member-names";
import { nameList } from "@/lib/garden/since-last-visit";
import type { AwayNews } from "@/lib/garden-v2/away";
import type { GardenState, Plant } from "@/lib/garden-v2/model";
import styles from "./garden-v2.module.css";

/** The lines of the note, in the garden's voice. Exported for tests. */
export function awayLines(news: AwayNews, state: Pick<GardenState, "catalog">, partner: string): string[] {
  const names = (plants: Plant[]) =>
    nameList(plants.map((p) => (state.catalog.find((c) => c.type_key === p.flower.type_key)?.display_name ?? p.flower.type_key).toLowerCase()));
  const lines: string[] = [];
  if (news.planted.length) lines.push(`${partner} planted a ${names(news.planted)}`);
  if (news.partnerCare.length) lines.push(`${partner} cared for the ${names(news.partnerCare)}`);
  if (news.grew.length) lines.push(`the ${names(news.grew)} grew`);
  if (news.bloomed.length) lines.push(`the ${names(news.bloomed)} bloomed ✿`);
  if (news.fulfilled.length) lines.push(news.fulfilled.length === 1 ? "a wish came true" : `${news.fulfilled.length} wishes came true`);
  return lines;
}

/** "While you were away…": a small handwritten note floating over the garden. */
export function AwayNote({ news, state, onDismiss }: { news: AwayNews; state: GardenState; onDismiss: () => void }) {
  const partner = usePartnerName();
  const lines = awayLines(news, state, partner.short);
  if (!lines.length) return null;
  return (
    <section data-world-reserved className={styles.away} aria-labelledby="away-title">
      <h2 id="away-title" className={styles.awayTitle}>
        while you were away…
      </h2>
      <ul className={styles.awayLines}>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button type="button" className={styles.awayDismiss} onClick={onDismiss}>
        lovely, thanks
      </button>
    </section>
  );
}

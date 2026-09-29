"use client";
import { usePartnerName } from "@/components/auth/member-names";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMemberPreferences } from "@/components/settings/member-preferences";
import { PixelIcon } from "@/components/ui/pixel-icon";
import type { AchievementResult } from "@/lib/achievements/model";
import type { CatalogItem, GardenResult, GardenState, Plant } from "@/lib/garden/model";
import type { GardenMutation } from "@/lib/garden/use-garden";
import {
  badgeSignature,
  publishBadges,
  readStoredSnapshot,
  writeStoredSnapshot,
  addPending,
  diffSnapshot,
  hasNews,
  resolvePending,
  mergeNews,
  noNews,
  nameList,
  snapshotKey,
  takeSnapshot,
  unreadBadges,
  type EarnedBadge,
  type VisitNews,
} from "@/lib/garden/since-last-visit";
import { FlowerSprite } from "./flower-sprite";
import styles from "./since-last-visit.module.css";

function plantSprite(plant: Plant, item: CatalogItem | undefined) {
  const flower = plant.flower;
  return (
    <FlowerSprite
      {...(flower.type_key === "dandelion"
        ? { type: "dandelion" as const, fulfilled: !!flower.fulfilled_at }
        : { type: flower.type_key })}
      growthUnits={flower.growth_units}
      growthTarget={item?.growth_target ?? Math.max(1, flower.growth_units)}
      bloomed={!!flower.first_bloom_at}
      size={32}
    />
  );
}

type Target = { key: string; label: string; name: string; sprite: ReactNode; open?: () => void };
type Line = {
  key: "bloom" | "unlock" | "care" | "badge";
  kicker: string;
  text: string;
  glyph: ReactNode;
  action: string;
  targets: Target[];
  href?: string;
};

/**
 * Wraps the garden's mutate so the card can tell the viewer's own actions
 * apart. The result state is recorded in the same batch that renders it.
 */
export function useOwnActions(mutate: (command: GardenMutation) => Promise<GardenResult>) {
  const [result, setResult] = useState<GardenState | null>(null);
  const ownMutate = useCallback(
    async (command: GardenMutation) => {
      const outcome = await mutate(command);
      if (outcome.state) setResult(outcome.state);
      return outcome;
    },
    [mutate],
  );
  return { mutate: ownMutate, result };
}

// Loaded on demand so the hotbar and garden modules stay free of the server
// action's module graph until the first read.
const readAchievements = () =>
  import("@/lib/achievements/actions").then((actions) => actions.readAchievements());

// Pixel confetti: fixed offsets so every burst is the same small pop.
const confetti = [
  [-150, -46], [-118, -84], [-84, -106], [-46, -118], [-12, -124], [24, -116], [60, -104],
  [96, -86], [128, -60], [154, -30], [-136, -12], [-96, -40], [-58, -70], [-20, -86],
  [16, -74], [52, -58], [88, -30], [120, -8], [-70, -18], [36, -22],
];

/**
 * Whether a scroll box has more below its visible part. The card fades its
 * last visible line to hint at the rest (issue #135).
 */
function useMoreBelow() {
  const [list, setList] = useState<HTMLElement | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    // With no list there is nothing to fade; a new list is checked at once.
    if (!list) return;
    const check = () =>
      setMore(list.scrollHeight - list.scrollTop - list.clientHeight > 1);
    check();
    list.addEventListener("scroll", check, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    observer?.observe(list);
    // Lines can arrive or grow without the capped list changing size.
    for (const child of Array.from(list.children)) observer?.observe(child);
    const mutation =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
        for (const child of Array.from(list.children)) observer?.observe(child);
        check();
      });
    mutation?.observe(list, { childList: true });
    return () => {
      list.removeEventListener("scroll", check);
      observer?.disconnect();
      mutation?.disconnect();
    };
  }, [list]);
  return [setList, more] as const;
}

export function SinceLastVisit({
  state,
  openSpot,
  focusGarden,
  quiet = false,
  hold = false,
  ownResult = null,
  loadAchievements = readAchievements,
  onCard,
}: {
  state: GardenState;
  openSpot: (spot: number) => void;
  focusGarden: () => void;
  /** A flower or seed sheet is open: the viewer may be acting. */
  quiet?: boolean;
  /** The garden guide is open (decision 0056): the news waits, unchanged,
      and appears once the guide closes or finishes. */
  hold?: boolean;
  /** The latest state returned by the viewer's own action. */
  ownResult?: GardenState | null;
  loadAchievements?: () => Promise<AchievementResult>;
  /** Receives the open card, or null once it closes, so the Today card can
      make room for it (issue #137). */
  onCard?: (card: HTMLElement | null) => void;
}) {
  const partnerName = usePartnerName();
  const titleId = useId();
  const card = useRef<HTMLElement | null>(null);
  const cardRef = useCallback((element: HTMLElement | null) => {
    card.current = element;
    onCard?.(element);
  }, [onCard]);
  const [linesRef, moreBelow] = useMoreBelow();
  const disabled = useRef(false);
  const badgesLoaded = useRef(false);
  const [badges, setBadges] = useState<{ list: EarnedBadge[]; generation: number } | null>(null);
  const held = useRef<VisitNews>(noNews);
  // Own-action badge guard. Each achievements read records the generation it
  // started in. An own action bumps the generation and marks badges pending,
  // in memory and in the stored snapshot, until a read that started after it
  // succeeds. That read only moves the baseline, however late it lands.
  const generation = useRef(0);
  const pendingSince = useRef<number | null>(null);
  const lastSignature = useRef<string | null>(null);
  const [news, setNews] = useState<VisitNews | null>(null);
  const [burst, setBurst] = useState(0);
  const preferences = useMemberPreferences();
  const gentleMotion = preferences?.state?.gentle_motion === true;
  const signature = badgeSignature(state);

  // Achievements are not part of the garden state, so read them once on load
  // and again only after a garden change that could have earned one.
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      const started = generation.current;
      loadAchievements()
        .then((result) => {
          if (!live || !result.state) return;
          badgesLoaded.current = true;
          setBadges({
            list: result.state.achievements
              .filter((a) => a.earned_at !== null)
              .map((a) => ({ id: a.achievement_id, title: a.title })),
            generation: started,
          });
        })
        .catch(() => {});
    }, badgesLoaded.current ? 1500 : 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [signature, loadAchievements]);

  // Compare the current garden with this browser's snapshot, then advance
  // the snapshot at once so a reload or second tab never celebrates twice.
  // Blooms, unlocks and badges that arrive with the viewer's own action (a
  // state returned by it, or any change while a flower or seed sheet is open)
  // only move the snapshot. Partner care is never the viewer's own; while a
  // sheet is open it waits and appears once the sheet closes.
  useEffect(() => {
    if (disabled.current) return;
    const key = snapshotKey(state);
    const stored = readStoredSnapshot(key);
    if (!stored.ok) {
      disabled.current = true;
      return;
    }
    const silent = quiet || state === ownResult;
    // A change that could earn a badge arrived with the viewer's own action.
    if (silent && lastSignature.current !== null && lastSignature.current !== signature)
      pendingSince.current = ++generation.current;
    lastSignature.current = signature;
    // A pending flag stored by an earlier visit counts from generation 0.
    if (stored.snapshot?.badgesPending && pendingSince.current === null) pendingSince.current = 0;
    const earned = badges?.list ?? null;
    const found = diffSnapshot(stored.snapshot, state, earned);
    const settles = !!badges && pendingSince.current !== null && badges.generation >= pendingSince.current;
    if (settles) pendingSince.current = null;
    // Detection is the same whether or not the guide is up; only showing
    // waits. The viewer's own news is already silenced above, so only news
    // that would have been shown joins the stored waiting list.
    const shown: VisitNews = {
      blooms: silent ? [] : found.blooms,
      unlocks: silent ? [] : found.unlocks,
      partnerCare: found.partnerCare,
      badges: silent || settles || pendingSince.current !== null ? [] : found.badges,
    };
    const releasing = !hold && !quiet;
    const waiting = releasing ? resolvePending(stored.snapshot?.pending, state, earned) : null;
    // While held, anything parked in memory (partner care deferred during a
    // sheet) joins the stored list too, so no held news lives only in memory.
    const pending = hold ? addPending(stored.snapshot?.pending, mergeNews(held.current, shown)) : releasing ? waiting!.waiting : stored.snapshot?.pending;
    const next = { ...takeSnapshot(state, earned, stored.snapshot), badgesPending: pendingSince.current !== null, pending };
    if (!writeStoredSnapshot(key, next)) {
      disabled.current = true;
      return;
    }
    publishBadges({ key, unread: unreadBadges(next) });
    // Held news is stored above, so it survives a reload; memory is cleared
    // only now that the write has succeeded.
    if (hold) {
      held.current = noNews;
      return;
    }
    if (quiet) {
      held.current = mergeNews(held.current, shown);
      return;
    }
    const all = mergeNews(mergeNews(waiting?.news ?? noNews, held.current), shown);
    held.current = noNews;
    if (!hasNews(all)) return;
    // The card is non-modal and never takes focus; it only appears.
    setNews((old) => (old ? mergeNews(old, all) : all));
    setBurst((count) => count + 1);
  }, [state, badges, quiet, hold, ownResult, signature]);

  const catalog = new Map(state.catalog.map((item) => [item.type_key, item]));
  const current = new Map(state.plants.map((plant) => [plant.flower.id, plant]));
  const occupied = new Set(state.plants.map((plant) => plant.flower.spot));
  const emptySpot = Array.from({ length: state.garden.spot_capacity }, (_, i) => i + 1).find((spot) => !occupied.has(spot));
  const flowerTargets = (plants: Plant[]) =>
    plants.map((seen) => {
      const plant = current.get(seen.flower.id) ?? seen;
      const item = catalog.get(plant.flower.type_key);
      const name = item?.display_name ?? plant.flower.type_key;
      return {
        key: plant.flower.id,
        label: name,
        name: `${name}, spot ${plant.flower.spot}`,
        sprite: plantSprite(plant, item),
        open: current.has(plant.flower.id) ? () => openSpot(plant.flower.spot) : undefined,
      };
    });
  const names = (plants: Plant[]) =>
    nameList(plants.map((p) => catalog.get(p.flower.type_key)?.display_name ?? p.flower.type_key));

  const lines: Line[] = [];
  if (news?.blooms.length)
    lines.push({
      key: "bloom",
      kicker: news.blooms.length > 1 ? "Blooms" : "Bloom",
      text: `Your ${names(news.blooms)} bloomed`,
      glyph: <PixelIcon name="flower" className={styles.iconBloom} />,
      action: "Visit",
      targets: flowerTargets(news.blooms),
    });
  if (news?.unlocks.length)
    lines.push({
      key: "unlock",
      kicker: "Unlocked",
      text: `${nameList(news.unlocks.map((u) => u.display_name))} unlocked`,
      glyph: <PixelIcon name="sprout" className={styles.iconUnlock} />,
      action: "Plant",
      targets: [
        {
          key: "unlock",
          label: "Plant a seed",
          name: "Plant a seed",
          sprite: (
            <FlowerSprite type={news.unlocks[0].type_key} presentation="full-bloom" growthUnits={0} growthTarget={news.unlocks[0].growth_target} bloomed={false} size={32} />
          ),
          open: emptySpot ? () => openSpot(emptySpot) : undefined,
        },
      ],
    });
  if (news?.partnerCare.length)
    lines.push({
      key: "care",
      kicker: `${partnerName.label} care`,
      text: `${partnerName.subject} cared for ${names(news.partnerCare)}`,
      glyph: <PixelIcon name="heart" className={styles.iconCare} />,
      action: "Visit",
      targets: flowerTargets(news.partnerCare),
    });
  if (news?.badges.length)
    lines.push({
      key: "badge",
      kicker: news.badges.length > 1 ? "New badges" : "New badge",
      text: `${news.badges.length > 1 ? "New badges" : "New badge"}: ${nameList(news.badges.map((b) => b.title))}`,
      glyph: <PixelIcon name="flower" className={styles.iconBadge} />,
      action: "View",
      targets: [],
      href: "/achievements",
    });

  function dismiss() {
    const hadFocus = !!card.current?.contains(document.activeElement);
    setNews(null);
    if (hadFocus) focusGarden();
  }

  // While the guide is open the card and its announcement wait.
  if (hold) return null;
  const announcement = lines.length ? `While you were away: ${lines.map((line) => line.text).join(". ")}.` : "";
  return (
    <>
      <p role="status" className={styles.screenReader}>{announcement}</p>
      {lines.length > 0 && (
        <section ref={cardRef} className={styles.card} aria-labelledby={titleId} data-since-last-visit="">
          {gentleMotion && (
            <span key={burst} className={styles.burst} aria-hidden="true">
              {confetti.map(([x, y], index) => (
                <i key={index} style={{ "--dx": `${x}px`, "--dy": `${y}px` } as CSSProperties} />
              ))}
            </span>
          )}
          <h2 id={titleId} className={`sheet-title ${styles.title}`}>
            <span className={styles.sparkle} aria-hidden="true" />
            While you were away
          </h2>
          <button type="button" className={`sheet-close ${styles.close}`} aria-label="Dismiss While you were away" onClick={dismiss}>
            <span aria-hidden="true">×</span>
          </button>
          <ul ref={linesRef} className={styles.lines} data-more={moreBelow || undefined}>
            {lines.map((line) => (
              <li key={line.key} data-line={line.key}>
                <LineView line={line} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function LineView({ line }: { line: Line }) {
  const single = line.href || line.targets.length === 1 ? line.targets[0] : undefined;
  const body = (glyph: ReactNode) => (
    <>
      <span className={styles.slot} aria-hidden="true">{glyph}</span>
      <span className={styles.text}>
        <span className={styles.kicker} aria-hidden="true">{line.kicker}</span>
        <span>{line.text}</span>
      </span>
    </>
  );
  if (line.href)
    return (
      <Link href={line.href} scroll={false} prefetch={false} className={styles.row} data-kind={line.key}>
        {body(line.glyph)}
        <span className={styles.go}>{line.action}<PixelIcon name="arrow" /></span>
      </Link>
    );
  if (single?.open)
    return (
      <button type="button" className={styles.row} data-kind={line.key} onClick={single.open}>
        {body(single.sprite)}
        <span className={styles.go}>{line.action}<PixelIcon name="arrow" /></span>
      </button>
    );
  if (single) return <div className={`${styles.row} ${styles.still}`} data-kind={line.key}>{body(single.sprite)}</div>;
  return (
    <div className={`${styles.row} ${styles.still}`} data-kind={line.key}>
      {body(line.glyph)}
      <span className={styles.chips}>
        {line.targets.map((target) =>
          target.open ? (
            <button key={target.key} type="button" className={styles.chip} onClick={target.open} aria-label={`${line.action} ${target.name}`}>
              {target.sprite}
              <span>{target.label}</span>
            </button>
          ) : null,
        )}
      </span>
    </div>
  );
}

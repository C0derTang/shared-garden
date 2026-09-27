"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMemberPreferences } from "@/components/settings/member-preferences";
import { PixelIcon } from "@/components/ui/pixel-icon";
import type { AchievementResult } from "@/lib/achievements/model";
import type { CatalogItem, GardenState, Plant } from "@/lib/garden/model";
import {
  badgeSignature,
  publishBadges,
  readStoredSnapshot,
  writeStoredSnapshot,
  diffSnapshot,
  hasNews,
  mergeNews,
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

export function SinceLastVisit({
  state,
  openSpot,
  focusGarden,
  loadAchievements = readAchievements,
}: {
  state: GardenState;
  openSpot: (spot: number) => void;
  focusGarden: () => void;
  loadAchievements?: () => Promise<AchievementResult>;
}) {
  const titleId = useId();
  const card = useRef<HTMLElement>(null);
  const disabled = useRef(false);
  const badgesLoaded = useRef(false);
  const [badges, setBadges] = useState<EarnedBadge[] | null>(null);
  const [news, setNews] = useState<VisitNews | null>(null);
  const [burst, setBurst] = useState(0);
  const preferences = useMemberPreferences();
  const gentleMotion = preferences ? preferences.state?.gentle_motion === true : true;
  const signature = badgeSignature(state);

  // Achievements are not part of the garden state, so read them once on load
  // and again only after a garden change that could have earned one.
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      loadAchievements()
        .then((result) => {
          if (!live || !result.state) return;
          badgesLoaded.current = true;
          setBadges(
            result.state.achievements
              .filter((a) => a.earned_at !== null)
              .map((a) => ({ id: a.achievement_id, title: a.title })),
          );
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
  useEffect(() => {
    if (disabled.current) return;
    const key = snapshotKey(state);
    const stored = readStoredSnapshot(key);
    const next = stored.ok ? takeSnapshot(state, badges, stored.snapshot) : null;
    if (!stored.ok || !next || !writeStoredSnapshot(key, next)) {
      disabled.current = true;
      return;
    }
    publishBadges({ key, unread: unreadBadges(next) });
    const found = diffSnapshot(stored.snapshot, state, badges);
    if (!hasNews(found)) return;
    // The card is non-modal and never takes focus; it only appears.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- news comes from browser storage, an external system
    setNews((old) => (old ? mergeNews(old, found) : found));
    setBurst((count) => count + 1);
  }, [state, badges]);

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
      kicker: "Partner care",
      text: `Your partner cared for ${names(news.partnerCare)}`,
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

  const announcement = lines.length ? `While you were away: ${lines.map((line) => line.text).join(". ")}.` : "";
  return (
    <>
      <p role="status" className={styles.screenReader}>{announcement}</p>
      {lines.length > 0 && (
        <section ref={card} className={styles.card} aria-labelledby={titleId} data-since-last-visit="">
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
          <ul className={styles.lines}>
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

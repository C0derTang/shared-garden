"use client";
import { hydrangeaMoods } from "@/lib/garden/model";
import { usePartnerName } from "@/components/auth/member-names";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { GardenState } from "@/lib/garden/model";
import { sheetCue, todayPlan, type CareStatus, type FlowerCue } from "./due-today";
import { FlowerSprite } from "./flower-sprite";
import styles from "./today-card.module.css";

/** Opens a spot's sheet. `restoreFocus` returns focus to the card when it closes. */
export type VisitFromCard = (spot: number, restoreFocus: () => boolean) => void;

function rowNote(status: CareStatus, name: ReturnType<typeof usePartnerName>) {
  if (status.later) return "Opens 10 p.m.";
  if (!status.dueForYou) return `Waiting on ${name.object}`;
  if (status.partner) return `${name.label} cared · add yours`;
  if (status.cue === "at-risk") return "Not cared yet · may lose growth";
  return "Not cared yet today";
}

function count(label: string, due: number, who: "you" | "partner") {
  return (
    <span className={styles.count} data-who={who}>
      <i aria-hidden="true" />
      <span className={styles.countText}>{label} {due ? `${due} to tend` : "all tended"}</span>
    </span>
  );
}

/** The "While you were away" card is never squeezed below this height
    while a compact Today card would leave it more room (issue #137). */
const awayComfort = 200;
/** The away card's margin above the Today card's title tab. */
const awayMargin = 10;

/**
 * A parchment plaque above the hotbar: what each of you has left today, one
 * tap to the next flower, and a short list of the flowers still due
 * (decision 0051). While the "While you were away" card (`away`) is open and
 * the full plaque would leave it under 200px, the plaque turns compact: only
 * its title tab and the next action (issue #137).
 */
export function TodayCard({
  state,
  visit,
  away = null,
}: {
  state: GardenState;
  visit: VisitFromCard;
  away?: HTMLElement | null;
}) {
  const partnerName = usePartnerName();
  const plan = todayPlan(state);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const titleId = useId();
  const card = useRef<HTMLElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [clearance, setClearance] = useState(0);
  const [crowded, setCrowded] = useState(false);
  // The bar's full height, kept while the plaque is compact.
  const fullBar = useRef(0);
  const refocus = useRef(false);
  const next = plan.next;
  const hasAction = !!next || plan.plantSpot !== null;
  const compact = !!away && crowded && hasAction;
  const listed = expanded && plan.rows.length > 0 && !compact;
  // The in-flow spacer matches the collapsed plaque, so the garden can always
  // scroll its last plots clear of the card and the hotbar.
  // The same height is shared with the garden as --today-bar-height, so the
  // "While you were away" card keeps clear of the plaque when large text
  // makes it taller (issue #135).
  useLayoutEffect(() => {
    const element = bar.current;
    const host = card.current?.parentElement;
    if (!element) return;
    const measure = () => {
      if (!card.current?.hasAttribute("data-compact")) fullBar.current = element.offsetHeight;
      setClearance(element.offsetHeight);
      host?.style.setProperty("--today-bar-height", `${element.offsetHeight}px`);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      host?.style.removeProperty("--today-bar-height");
    };
  }, []);
  // Whether the full plaque would push the away card under its comfortable
  // height. The plaque is fixed above the hotbar, and the away card scrolls
  // with the garden, so this uses its unscrolled layout position.
  useEffect(() => {
    // With no away card the plaque is never compact, whatever was measured.
    if (!away) return;
    const check = () => {
      const root = card.current;
      const host = away.offsetParent as HTMLElement | null;
      if (!root || !host) return;
      const rect = root.getBoundingClientRect();
      const tab = root.querySelector("h2")?.getBoundingClientRect();
      const borders = root.offsetHeight - root.clientHeight;
      const fullTop =
        rect.bottom - fullBar.current - borders - Math.max(0, rect.top - (tab?.top ?? rect.top));
      const awayTop = host.getBoundingClientRect().top + window.scrollY + away.offsetTop;
      const squeezed = awayTop + awayComfort + awayMargin > fullTop;
      // Focus on the list toggle or a row moves to the next action when they hide.
      const focused = document.activeElement;
      if (squeezed && focused && root.contains(focused) && focused.getAttribute("data-today-focus") !== "primary" &&
        root.querySelector('[data-today-focus="primary"]'))
        refocus.current = true;
      setCrowded(squeezed);
    };
    check();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    observer?.observe(away);
    if (bar.current) observer?.observe(bar.current);
    window.addEventListener("resize", check);
    void document.fonts?.ready.then(check);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [away]);
  useEffect(() => {
    if (!compact || !refocus.current) return;
    refocus.current = false;
    card.current?.querySelector<HTMLElement>('[data-today-focus="primary"]')?.focus({ preventScroll: true });
  }, [compact]);
  function open(spot: number, from: string) {
    visit(spot, () => {
      const root = card.current;
      if (!root?.isConnected) return false;
      const target = [from, "primary", "toggle", "title"]
        .map((key) => root.querySelector<HTMLElement>(`[data-today-focus="${key}"]`))
        .find((element) => element && !element.hasAttribute("disabled"));
      target?.focus({ preventScroll: true });
      return !!target;
    });
  }
  const laterOnly = plan.you === 0 && plan.partner === 0;
  return (
    <>
      <div className={styles.spacer} style={{ height: clearance }} aria-hidden="true" />
      <section
        ref={card}
        className={styles.card}
        aria-labelledby={titleId}
        data-state={plan.allTended ? "done" : undefined}
        data-compact={compact || undefined}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !listed) return;
          event.stopPropagation();
          setExpanded(false);
          card.current?.querySelector<HTMLElement>('[data-today-focus="toggle"]')?.focus();
        }}
      >
        <h2 id={titleId} className={styles.title} tabIndex={-1} data-today-focus="title">
          Today
        </h2>
        {listed && (
          <ul id={listId} className={styles.list} aria-label="Still to tend today">
            {plan.rows.map((status) => {
              const { plant, item } = status;
              return (
                <li key={plant.flower.id}>
                  <button
                    type="button"
                    className={styles.row}
                    data-today-focus={`row-${plant.flower.spot}`}
                    data-due={status.dueForYou || undefined}
                    onClick={() => open(plant.flower.spot, `row-${plant.flower.spot}`)}
                  >
                    <FlowerSprite
                      {...(item.type_key === "dandelion"
                        ? { type: "dandelion" as const, fulfilled: !!plant.flower.fulfilled_at }
                        : item.type_key === "hydrangea" ? { type: "hydrangea" as const, moods: hydrangeaMoods(plant) } : { type: item.type_key })}
                      growthUnits={plant.flower.growth_units}
                      growthTarget={item.growth_target}
                      bloomed={!!plant.flower.first_bloom_at}
                      size={32}
                      className={styles.rowSprite}
                    />
                    <span className={styles.rowText}>
                      <strong>{item.display_name}</strong>{" "}
                      <span>
                        {rowNote(status, partnerName)}
                        <span className={styles.srOnly}>, spot {plant.flower.spot}</span>
                      </span>
                    </span>
                    <span className={styles.dots} aria-hidden="true">
                      <i data-cared={status.you} />
                      <i data-cared={status.partner} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bar} className={styles.bar}>
          {plan.allTended ? (
            <p className={styles.done}>
              All tended today <span aria-hidden="true">✿</span>
            </p>
          ) : compact ? (
            <p className={styles.srOnly}>
              {laterOnly
                ? "All tended for now. Moonflower opens 10 p.m."
                : `You ${plan.you ? `${plan.you} to tend` : "all tended"}. ${partnerName.label} ${plan.partner ? `${plan.partner} to tend` : "all tended"}.`}
            </p>
          ) : (
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={listed}
              aria-controls={listed ? listId : undefined}
              data-today-focus="toggle"
              onClick={() => setExpanded((open) => !open)}
            >
              <span className={styles.counts}>
                {laterOnly ? (
                  <>
                    <span className={styles.count}>All tended for now</span>
                    <span className={styles.count} data-who="later">
                      <i aria-hidden="true" />
                      Moonflower opens 10 p.m.
                    </span>
                  </>
                ) : (
                  <>
                    {count("You", plan.you, "you")}
                    {count(partnerName.label, plan.partner, "partner")}
                  </>
                )}
              </span>
              <span className={styles.chevron} aria-hidden="true" />
            </button>
          )}
          {next ? (
            <button
              type="button"
              className={styles.primary}
              data-today-focus="primary"
              onClick={() => open(next.plant.flower.spot, "primary")}
            >
              Tend {next.item.display_name}{" "}
              <span className={styles.srOnly}>in spot {next.plant.flower.spot}</span>
              <span className={styles.arrow} aria-hidden="true">→</span>
            </button>
          ) : plan.plantSpot !== null ? (
            <button
              type="button"
              className={styles.primary}
              data-today-focus="primary"
              data-kind="plant"
              onClick={() => open(plan.plantSpot!, "primary")}
            >
              Plant a seed{" "}
              <span className={styles.srOnly}>in spot {plan.plantSpot}</span>
              <span className={styles.arrow} aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}

/** The class for your care dot when your partner cared and you have not. */
export const yourDotCue = styles.nudge;

/** A decorative sparkle or at-risk drop beside a flower's care tag. */
export function FlowerCueMark({ cue }: { cue: FlowerCue }) {
  if (cue === "blooms") return <i className={styles.sparkle} aria-hidden="true" data-cue={cue} />;
  if (cue === "at-risk") return <i className={styles.risk} aria-hidden="true" data-cue={cue} />;
  return null;
}

/** The flower sheet heading's one-line cue for the same three states. */
export function SheetCue({ status }: { status: CareStatus | null }) {
  const partnerName = usePartnerName();
  const text = sheetCue(status, partnerName.subject);
  if (!text) return null;
  return (
    <p className={styles.sheetCue} data-cue={status!.cue}>
      {text}
      {status!.cue === "blooms" && <span aria-hidden="true">✿</span>}
    </p>
  );
}

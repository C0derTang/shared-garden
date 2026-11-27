"use client";
import { useRef, useState } from "react";
import v2 from "../garden-v2.module.css";
import styles from "./overlays.module.css";

/** The short guide's pages: a title in handwriting and one or two plain lines. */
export const guideSteps = [
  {
    title: "welcome to our new garden",
    body: "hi cc! i took a few creative liberties with the new garden, lmk if you want any changes!",
  },
  {
    title: "wander",
    body: "choose a scenic stop along the winding path with back, onward, or the stop menu. tap a flower to visit, then return to your view!",
  },
  {
    title: "keepsakes",
    body: "all the memories, achievements, songs, settings etc are in the upper left, and our old garden is still accessible via settings!",
  },
] as const;

/**
 * A short first-visit guide: three little pages with "next" and "back". Closing
 * it at any point (Escape, "×", "skip" or the last page) marks it seen, and
 * Settings can replay it.
 */
export function GuideView({ onDone, onStep }: { onDone: () => void; onStep?: (index: number) => void }) {
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = guideSteps[index]!;
  const last = index === guideSteps.length - 1;
  const go = (next: number) => {
    setIndex(next);
    onStep?.(next);
    // Keep keyboard and screen reader users on the new page's words.
    requestAnimationFrame(() => heading.current?.focus());
  };
  return (
    <div className={styles.guide}>
      <p className={styles.guideCount} aria-hidden="true">
        {guideSteps.map((_, i) => (
          <i key={i} data-current={i === index || undefined} />
        ))}
      </p>
      <h3
        ref={heading}
        tabIndex={-1}
        className={styles.guideTitle}
        aria-label={`${step.title}, page ${index + 1} of ${guideSteps.length}`}
        aria-describedby="guide-step-body"
      >
        {step.title}
      </h3>
      <p id="guide-step-body" className={styles.guideBody}>
        {step.body}
      </p>
      <div className={styles.guideActions}>
        {index > 0 ? (
          <button type="button" className={v2.textButton} onClick={() => go(index - 1)}>
            back
          </button>
        ) : (
          <button type="button" className={v2.textButton} onClick={onDone}>
            skip
          </button>
        )}
        <button type="button" className={v2.primary} onClick={() => (last ? onDone() : go(index + 1))}>
          {last ? "let’s wander" : "next"}
        </button>
      </div>
    </div>
  );
}

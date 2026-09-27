"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NewBadgeMark, newBadgeHost } from "@/components/garden/new-badge-mark";
import { PixelIcon } from "@/components/ui/pixel-icon";
import { usePublishedHeight } from "@/components/ui/published-height";

export type GardenDestination =
  "garden" | "memories" | "achievements" | "settings";

const destinations = [
  { id: "garden", label: "Garden", href: "/garden", icon: "sprout" },
  { id: "memories", label: "Memories", href: "/memories", icon: "book" },
  {
    id: "achievements",
    label: "Achievements",
    href: "/achievements",
    icon: "flower",
  },
] as const;

const px = (value: string) => parseFloat(value) || 0;

/**
 * Whether the four slots fit on one shelf: each slot's whole label plus its
 * frame and padding (never under its minimum width) and the 2px gaps. Label
 * widths do not depend on the slot layout, so the answer is the same in
 * either arrangement.
 */
function fitsOneRow(bar: HTMLElement) {
  const slots = Array.from(bar.querySelectorAll<HTMLElement>("a"));
  const needed = slots.reduce((sum, slot) => {
    const style = getComputedStyle(slot);
    const label = slot.querySelector("span")?.getBoundingClientRect().width ?? 0;
    const chrome =
      px(style.borderLeftWidth) + px(style.borderRightWidth) +
      px(style.paddingLeft) + px(style.paddingRight);
    return sum + Math.max(px(style.minWidth), label + chrome);
  }, 0) + px(getComputedStyle(bar).columnGap) * (slots.length - 1);
  const style = getComputedStyle(bar);
  const available = bar.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
  return needed <= available + 0.5;
}

// Mount only after the owning route has verified private access.
export function GardenNavigation({ current }: { current: GardenDestination }) {
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  // With large text the four labels no longer fit on one shelf, so the slots
  // wrap into two rows of two (issue #135). The measured height then replaces
  // the stylesheet's one-row --hotbar-height, so everything that clears the
  // hotbar still does. Until the first measurement `rows` is null and a CSS
  // estimate picks the arrangement, so the first paint is already right
  // (issue #137).
  const [rows, setRows] = useState<1 | 2 | null>(null);
  const twoRows = rows === 2;
  const publish = usePublishedHeight<HTMLDivElement>("--hotbar-height", "root", twoRows);
  const ref = useCallback((element: HTMLDivElement | null) => {
    setBar(element);
    publish(element);
  }, [publish]);
  useEffect(() => {
    if (!bar) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRows(fitsOneRow(bar) ? 1 : 2));
    };
    check();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    observer?.observe(bar);
    // Labels change width when the pixel font arrives or the text size changes.
    bar.querySelectorAll("a > span").forEach((label) => observer?.observe(label));
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [bar]);
  return (
    <div
      ref={ref}
      className="garden-navigation"
      data-rows={rows ?? undefined}
    >
      <nav aria-label="Garden" className="garden-primary-nav">
        {destinations.map(({ id, label, href, icon }) => (
          <Link
            key={id}
            href={href}
            prefetch={false}
            scroll={false}
            aria-current={current === id ? "page" : undefined}
            className={id === "achievements" ? newBadgeHost : undefined}
          >
            <PixelIcon name={icon} />
            <span>{label}</span>
            {id === "achievements" && <NewBadgeMark viewing={current === id} />}
          </Link>
        ))}
      </nav>
      <nav aria-label="Settings" className="garden-settings-nav">
        <Link
          href="/settings"
          prefetch={false}
          scroll={false}
          aria-current={current === "settings" ? "page" : undefined}
        >
          <PixelIcon name="settings" />
          <span>Settings</span>
        </Link>
      </nav>
    </div>
  );
}

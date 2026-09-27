"use client";
import { useEffect, useSyncExternalStore } from "react";
import { markBadgesViewed, subscribeBadges, unreadBadgeCount } from "@/lib/garden/since-last-visit";
import styles from "./since-last-visit.module.css";

/** Positions the unread dot on the Achievements hotbar slot (decision 0054). */
export const newBadgeHost = styles.newBadgeHost;

/** The unread badge dot. Opening the Achievements panel marks every badge seen. */
export function NewBadgeMark({ viewing }: { viewing: boolean }) {
  const unread = useSyncExternalStore(subscribeBadges, unreadBadgeCount, () => 0);
  useEffect(() => {
    if (viewing && unread) markBadgesViewed();
  }, [viewing, unread]);
  if (!unread || viewing) return null;
  return (
    <span className={styles.newBadge}>
      <span className={styles.screenReader}>, {unread} new badge{unread === 1 ? "" : "s"}</span>
    </span>
  );
}

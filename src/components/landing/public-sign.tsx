import type { ReactNode } from "react";
import { PixelIcon } from "@/components/ui/pixel-icon";
import styles from "./public.module.css";

/** The wooden name sign shared by the public pages, like the garden header. */
export function PublicSign({ note }: { note?: ReactNode }) {
  return (
    <header className={styles.sign}>
      <span className={styles.wordmark}>
        <PixelIcon name="sprout" />
        cc’s garden
      </span>
      {note && <span className={styles.signNote}>{note}</span>}
    </header>
  );
}

import Image from "next/image";
import styles from "./sunset-home.module.css";

/** The original transparent flower stays separate from the landscape. Wind is
 * anchored at the visible stalk base; reduced motion leaves it fully still. */
export function SpiderLily() {
  return <div className={styles.spiderLily} aria-hidden="true">
    <div className={styles.lilySway}>
      <Image
        src="/sunset-home/red-spider-lily.png"
        alt=""
        fill
        sizes="(max-width: 820px) 300px, (max-width: 1100px) 30vw, 390px"
        priority
        className={styles.lilyImage}
      />
    </div>
  </div>;
}

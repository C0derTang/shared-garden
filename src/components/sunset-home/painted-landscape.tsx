import Image from "next/image";
import styles from "./sunset-home.module.css";

export function PaintedLandscape() {
  return <Image
    src="/sunset-home/painted-lake.png"
    alt=""
    fill
    sizes="(max-aspect-ratio: 3/2) 150vh, 100vw"
    priority
    className={styles.landscapeImage}
  />;
}

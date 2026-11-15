import Image from "next/image";
import styles from "./sunset-home.module.css";

const image = { src: "/sunset-home/painted-lake.png", alt: "", fill: true,
  sizes: "(max-aspect-ratio: 3/2) 150vh, 100vw" } as const;

/** Stationary masks share the photograph's cover crop. Only sky and open water
 * receive moving copies; mountains, sun and shore remain in the base image. */
export function PaintedLandscape() {
  return <>
    <Image {...image} priority className={styles.landscapeImage} />
    <div className={`${styles.sceneLayer} ${styles.clouds}`}><Image {...image} loading="eager" className={`${styles.landscapeImage} ${styles.cloudImage}`} /></div>
    <div className={`${styles.sceneLayer} ${styles.waterFar}`}><Image {...image} loading="eager" className={`${styles.landscapeImage} ${styles.farRipple}`} /></div>
    <div className={`${styles.sceneLayer} ${styles.waterNear}`}><Image {...image} loading="eager" className={`${styles.landscapeImage} ${styles.nearRipple}`} /></div>
  </>;
}

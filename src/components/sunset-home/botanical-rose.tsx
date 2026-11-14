import { useId } from "react";
import styles from "./sunset-home.module.css";
import { RoseBloom } from "./rose-bloom";

const leaves = [
  {
    edge: "M0 0C13-11 20-27 35-36L43-38 48-43 57-43 65-47C75-46 84-42 91-47 85-37 79-24 68-18L60-16 55-10 46-9 41-4C26 3 13 3 0 0Z",
    fold: "M0 0C24-8 52-18 91-47 81-30 69-19 58-15 45-4 21 5 0 0Z",
    rib: "M0 0C23-10 50-19 91-47",
    tip: "M65-47Q83-39 91-47 85-35 79-29 72-26Q78-38 65-47Z",
    veins: "M12-6Q16-20 30-30M22-10Q28-28 43-36M34-15Q40-34 55-40M47-22Q55-39 67-42M58-28Q67-39 77-41M14-5Q28-3 36-6M27-11Q41-6 48-12M42-19Q52-12 61-20M56-27Q66-22 72-30",
  },
  {
    edge: "M0 0C21-21 37-28 54-25 65-27 74-31 82-36 76-22 64-13 48-9 31-3 15 2 0 0Z",
    fold: "M0 0C28-13 54-12 82-36 70-15 48-8 30-5 16 0 8 1 0 0Z",
    rib: "M0 0C27-14 58-15 82-36",
    tip: "M54-25Q71-23 82-36 76-19 65-14 53-11Q65-22 54-25Z",
    veins: "M15-7Q19-19 30-22M27-11Q33-23 43-24M40-15Q48-25 56-24M19-8Q29-4 36-7M35-13Q44-8 51-12M50-18Q59-15 65-21",
  },
  {
    edge: "M0 0C14-10 20-24 30-31L38-33 43-38 52-36C64-39 72-35 82-40 80-28 72-19 65-15L58-14 52-8 45-8 38-3C25 5 13 5 0 0Z",
    fold: "M0 0C24-5 52-22 82-40 72-21 57-12 39-5 23 5 12 4 0 0Z",
    rib: "M0 0C24-6 54-24 82-40",
    tip: "M62-37Q75-31 82-40 80-28 72-23 65-20Q72-30 62-37Z",
    veins: "M13-5Q15-17 28-28M25-10Q28-25 40-31M37-16Q41-32 53-33M51-25Q56-33 65-34M15-5Q24 2 32-3M28-11Q37-5 46-10M42-19Q52-14 59-21",
  },
];

function Leaf({ x, y, rotate, scale = 1, gradient, variant = 0 }: { x: number; y: number; rotate: number; scale?: number; gradient: string; variant?: number }) {
  const leaf = leaves[variant];
  return <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
    <g className={styles.leafFlutter}>
      <path d={leaf.edge} fill={`url(#${gradient})`} />
      <path d={leaf.fold} fill={`url(#${gradient}-fold)`} opacity="0.78" />
      <path d={leaf.tip} fill="#98a47a" opacity="0.7" />
      <path d={leaf.rib} fill="none" stroke="#c9c79a" strokeWidth="0.65" opacity="0.7" />
      <path d={leaf.veins} fill="none" stroke="#c2c69e" strokeWidth="0.45" opacity="0.34" />
      <path d={leaf.edge} fill="none" stroke="#314f42" strokeWidth="0.45" opacity="0.4" />
    </g>
  </g>;
}

export function BotanicalRose() {
  const id = useId().replaceAll(":", "");
  return <svg className={styles.rose} viewBox="40 30 350 550" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-leaf`} x2="0.8" y2="1"><stop stopColor="#b9bb83" /><stop offset="0.27" stopColor="#8c9f70" /><stop offset="0.62" stopColor="#607d61" /><stop offset="1" stopColor="#334f45" /></linearGradient>
      <linearGradient id={`${id}-leaf-fold`} x1="0" y1="0" x2="0.4" y2="1"><stop stopColor="#637f62" /><stop offset="0.5" stopColor="#3c5a4c" /><stop offset="1" stopColor="#263f38" /></linearGradient>
    </defs>
    <g className={styles.roseSway}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M313 573C289 513 296 463 275 407" stroke="#4f6b59" strokeWidth="3" />
        <path d="M311 572C287 510 293 463 273 407" stroke="#d7c58c" strokeWidth="0.8" />
        <path d="M295 493Q317 464 339 438" stroke="#58735d" strokeWidth="1.5" />
      </g>
      <Leaf x={339} y={438} rotate={-21} scale={0.7} variant={1} gradient={`${id}-leaf`} />
      <g className={styles.upperSway}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M275 407C254 351 235 298 222 211" stroke="#4f6b59" strokeWidth="2.8" />
        <path d="M273 407C252 351 232 296 220 212" stroke="#d7c58c" strokeWidth="0.8" />
        <path d="M253 347Q283 322 306 279M278 422Q252 397 219 379M269 397Q257 364 242 345" stroke="#58735d" strokeWidth="1.5" />
        <path d="m249 341-8-11 6 1m26 76 8-10-3 18m6 32-8-9 6 2" fill="#799071" stroke="#526d5a" strokeWidth="0.8" />
      </g>
      <Leaf x={306} y={279} rotate={-8} scale={0.91} gradient={`${id}-leaf`} />
      <Leaf x={286} y={313} rotate={52} scale={0.72} variant={1} gradient={`${id}-leaf`} />
      <Leaf x={219} y={379} rotate={184} scale={1.03} variant={2} gradient={`${id}-leaf`} />
      <Leaf x={242} y={345} rotate={211} scale={0.72} variant={1} gradient={`${id}-leaf`} />
      <g className={styles.bloomNod}>
        <g stroke="#58715a" strokeWidth="0.8" fill="#668164">
          <path d="M217 208Q193 224 178 218Q200 219 207 198L223 198Q242 196 256 187Q249 208 230 220L225 216Q237 241 244 243Q230 237 220 223Q210 242 199 249Q206 231 217 208Z" />
        </g>
        <RoseBloom id={id} />
      </g>
      </g>
    </g>
  </svg>;
}

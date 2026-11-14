import { useId } from "react";
import styles from "./sunset-home.module.css";

type Point = readonly [number, number];
const far: Point[] = [[-40, 322], [28, 282], [63, 296], [119, 232], [154, 262], [205, 207], [234, 224], [283, 175], [318, 207], [352, 194], [415, 252], [449, 240], [507, 288], [559, 259], [620, 296], [690, 265], [748, 298], [803, 279], [859, 309], [910, 286], [980, 313], [1052, 270], [1110, 295], [1170, 233], [1200, 248], [1265, 185], [1301, 216], [1360, 192], [1422, 252], [1480, 237]];
const middle: Point[] = [[-40, 238], [15, 264], [59, 250], [114, 300], [170, 277], [211, 305], [260, 249], [310, 278], [357, 265], [409, 304], [451, 283], [511, 330], [570, 310], [638, 342], [711, 325], [770, 351], [822, 339], [873, 357], [940, 332], [997, 344], [1051, 309], [1100, 326], [1146, 284], [1192, 307], [1233, 267], [1287, 290], [1337, 250], [1390, 280], [1480, 249]];
const near: Point[] = [[-40, 301], [18, 289], [67, 321], [117, 313], [159, 341], [201, 328], [247, 352], [292, 345], [349, 365], [404, 352], [464, 373], [528, 364], [589, 385], [679, 376], [755, 391], [826, 377], [892, 383], [951, 367], [1003, 376], [1065, 350], [1110, 362], [1167, 337], [1213, 349], [1270, 315], [1330, 329], [1390, 300], [1480, 319]];
const ridge = (points: Point[]) => points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");

/** Etched contours follow each ridge down to the shore, with no raster assets. */
function Mountain({ points, floor, fill, stroke, lines }: { points: Point[]; floor: number; fill: string; stroke: string; lines: number }) {
  return <g stroke={stroke} strokeLinejoin="round" strokeLinecap="round">
    <path d={`${ridge(points)} L1480 ${floor} L-40 ${floor}Z`} fill={fill} strokeWidth="1" />
    <g fill="none" strokeWidth="0.65" opacity="0.6">
      {Array.from({ length: lines }, (_, line) => {
        const t = (line + 1) / (lines + 1);
        return <path key={line} d={ridge(points.map(([x, y], i) => [x + Math.sin(i * 2.7 + t * 8) * 8 * t, y + (floor - y) * t + Math.sin(i * 1.5 + line * 0.55) * 2.5 * t]))} />;
      })}
    </g>
    <g fill="none" strokeWidth="0.7" opacity="0.55">
      {points.filter((_, i) => i % 2 === 1).map(([x, y], i) => <g key={x}>
        <path d={`M${x} ${y + 3}q${-12 - i % 3 * 9} 32 ${-24 - i % 4 * 11} ${floor - y - 5}`} />
        <path d={`M${x + 4} ${y + 9}q${12 + i % 4 * 7} 31 ${23 + i % 4 * 15} ${floor - y - 15}`} />
      </g>)}
    </g>
  </g>;
}

export function Landscape() {
  const id = useId().replaceAll(":", "");
  return <svg className={styles.landscape} viewBox="0 0 1440 540" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-sky`} x2="0" y2="1"><stop stopColor="#f3e9e2" /><stop offset="0.57" stopColor="#f1cbbd" /><stop offset="1" stopColor="#f7e9d9" /></linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor="#f9d8ac" stopOpacity="0.85" /><stop offset="1" stopColor="#f7d7bc" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-water`} x2="0" y2="1"><stop stopColor="#dec7c6" /><stop offset="0.5" stopColor="#efd6cb" /><stop offset="1" stopColor="#f8eee3" /></linearGradient>
      <linearGradient id={`${id}-fade`} x2="0" y2="1"><stop stopColor="#f8eee3" stopOpacity="0" /><stop offset="1" stopColor="#f8eee3" /></linearGradient>
    </defs>
    <path d="M0 0h1440v540H0Z" fill={`url(#${id}-sky)`} />
    <ellipse cx="958" cy="199" rx="330" ry="265" fill={`url(#${id}-glow)`} />
    <g fill="none" stroke="#b98979" strokeWidth="0.65" opacity="0.3">
      <path d="M53 109c110-13 156 8 257-1s166-17 242-5M4 117c112-14 162 9 242 0M97 124c83-8 177 5 249-4M594 79c77-8 107 2 194-5M629 86c69-6 122 0 149-4M1117 127c133-12 192 10 292-1M1219 136c87-4 150 2 221-2" />
    </g>
    <circle cx="956" cy="201" r="76" fill="#f9e0b9" stroke="#c69780" strokeWidth="0.8" />
    <circle cx="956" cy="201" r="82" fill="none" stroke="#cfa18b" strokeWidth="0.5" opacity="0.55" />
    <g stroke="#d4a383" strokeWidth="0.55" opacity="0.4">
      {Array.from({ length: 18 }, (_, i) => {
        const y = 205 + i * 3.4;
        const half = Math.sqrt(76 ** 2 - (y - 201) ** 2);
        return <path key={i} d={`M${956 - half} ${y}h${half * 2}`} />;
      })}
    </g>
    <Mountain points={far} floor={399} fill="#d9c4c7" stroke="#967d90" lines={24} />
    <Mountain points={middle} floor={404} fill="#c9b3bd" stroke="#826e81" lines={27} />
    <Mountain points={near} floor={408} fill="#b7a3af" stroke="#776475" lines={20} />
    <path d="M0 405c231-8 432 7 718 0s441 6 722-1v136H0Z" fill={`url(#${id}-water)`} />
    <g fill="none" strokeLinecap="round">
      {Array.from({ length: 76 }, (_, i) => {
        const y = 411 + i * 1.72;
        const x = (i * 137.5) % 1420 - 80;
        const width = 60 + (i * 51) % 265;
        return <path key={i} d={`M${x} ${y}q${width / 2} ${Math.sin(i) * 2} ${width} 0`} stroke="#97828d" strokeWidth={i % 3 ? "0.65" : "0.85"} opacity={0.4 - i * 0.0035} />;
      })}
      {Array.from({ length: 31 }, (_, i) => {
        const y = 411 + i * 3.2;
        const half = 13 + i * 2.4 + Math.sin(i * 1.8) * 12;
        return <path key={i} d={`M${956 - half} ${y}q${half} ${Math.sin(i) * 2} ${half * 2} 0`} stroke="#fff0d2" strokeWidth={1.8 - i * 0.035} opacity={0.85 - i * 0.019} />;
      })}
      <path d="M0 404q163 7 280 0t244 2M1133 404q176-7 307-2M71 416h214M492 415h155M1216 415h224" stroke="#766775" strokeWidth="0.8" opacity="0.6" />
    </g>
    <g fill="none" stroke="#766b79" strokeWidth="0.7" strokeLinecap="round" opacity="0.8">
      {Array.from({ length: 25 }, (_, i) => {
        const x = 18 + i * 8.4;
        const y = 398 - Math.sin(i * 0.7) * 2;
        const h = 7 + (i * 7) % 18;
        return <path key={i} d={`M${x} ${y}v-${h}m0 3-3 5m3-3 3 4m-3-1-5 6m5-4 5 5m-5-1-6 5m6-3 6 4`} />;
      })}
    </g>
    <g fill="none" stroke="#866b74" strokeWidth="1" opacity="0.7">
      <path d="M738 164q5-5 10 0 5-5 10 0M779 145q4-3 8 0 4-3 8 0M807 172q4-4 8 0 4-4 8 0" />
    </g>
    <path d="M0 488h1440v52H0Z" fill={`url(#${id}-fade)`} />
  </svg>;
}

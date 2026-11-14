import { useId } from "react";
import styles from "./sunset-home.module.css";

// Uneven silhouettes and distinct eroded faces replace regular contour meshes.
const ranges = [
  {
    key: "distant", top: "#d4c7cb", bottom: "#e6d0cb", ink: "#a99aa9",
    outline: "M-40 304Q13 291 43 275L72 267 88 249 105 254 131 229 143 234 162 217 177 220 198 200 212 211 225 209 248 233 265 239Q303 271 333 279L360 270 381 276 404 264 427 280Q471 294 510 311L553 297 577 303 607 289 627 301 651 297Q704 317 751 310L789 292 807 301 830 287 848 297 866 291Q914 312 948 300L974 282 993 286 1014 267 1033 276 1060 253 1076 256 1095 237 1111 249 1128 243 1152 263 1179 244 1200 247 1221 224 1243 227 1267 204 1281 219 1300 211 1318 230 1335 231Q1379 264 1414 273L1480 284",
    faces: ["M198 200L189 237 204 234 214 257 236 267 252 291 296 302 265 239 248 233 225 209Z", "M1267 204L1244 252 1262 246 1274 274 1310 295 1334 302 1318 230 1300 211 1281 219Z"],
    details: "M198 201l-14 38-17 15-10 25m41-75 11 28-4 16 17 22M143 235l-5 24-17 12M248 235l-12 16 8 16M1095 239l-11 32-22 20m34-48 6 27 19 18M1267 208l-8 35 15 25 7 26M1221 226l-6 27-19 16M1300 214l-1 27 17 23",
  },
  {
    key: "far", top: "#bbb1bd", bottom: "#d9c4c5", ink: "#92889b",
    outline: "M-40 279L-4 265 20 274 44 258 65 262 87 240 103 247 124 222 140 231 153 225 176 252 197 260Q223 282 247 289L272 279 298 293 323 285 348 307 369 305Q417 320 456 326L482 318 506 327 529 319 550 336Q618 347 676 344L704 333 735 344 759 339Q830 357 878 343L900 349 924 329 945 335 973 311 991 316 1015 295 1032 304 1056 286 1083 307 1106 302 1132 322 1157 303 1175 307 1196 281 1211 283 1233 256 1251 269 1263 264 1287 292 1306 294 1328 282 1349 296 1367 291 1397 310 1440 294 1480 306",
    faces: ["M124 222Q118 242 121 251L133 258Q126 268 135 279L151 292Q162 307 174 323L217 340 248 341Q219 302 197 260L176 252 153 225 140 231Z", "M323 285L313 312 323 321 337 347 374 359 417 358 369 305 348 307Z", "M1015 295L1001 320 1008 331 987 350 1018 363 1052 365 1083 307 1056 286 1032 304Z", "M1233 256Q1224 275 1229 287L1239 298Q1232 312 1240 324L1263 340Q1284 349 1307 359L1368 353 1328 282 1306 294 1287 292 1263 264 1251 269Z"],
    details: "M124 225l-9 23 5 14-20 18-7 22m39-67 5 29 19 17-4 19 28 25M87 243l-5 27-19 18m20-16-6 25M176 254l-8 19 15 29M272 282l-11 21-17 9m29-22 5 25 14 14M323 288l-7 23 9 17M482 322l-11 21-20 10M991 318l-12 22-18 14M1056 289l-14 28 7 20-13 12m22-53 8 20 23 13M1196 284l-5 22-26 19m26-13-6 24M1234 261l-9 25 13 17-3 15 19 19m-16-64 18 19 3 18 28 24M1328 286l-7 24 14 19m-14-17-18 22M1397 311l-13 25-22 9",
  },
  {
    key: "middle", top: "#a7a0ad", bottom: "#c4b8bc", ink: "#817f90",
    outline: "M-40 311Q-9 299 22 311L45 308 69 326Q88 327 107 343L136 336 159 344 180 336Q209 355 241 351L270 365 289 359Q332 373 370 368L403 376 435 371Q475 386 526 380L565 389Q615 387 652 397L697 391 721 398Q774 385 815 393L852 382 871 385Q901 369 931 373L952 357 968 362 988 345 1005 349Q1037 329 1070 334L1090 320 1112 329 1128 324Q1161 347 1189 339L1218 345 1238 333 1258 338Q1295 319 1331 329L1357 316 1378 321 1401 307 1420 313 1480 298",
    faces: ["M22 311L44 340 78 353 99 375 149 387 193 392 159 344 136 336 107 343 69 326 45 308Z", "M1070 334Q1048 346 1056 357L1061 368Q1054 379 1038 389L1135 397 1189 339 1161 347 1128 324 1112 329 1090 320Z", "M1331 329L1316 348 1332 365 1304 386 1415 392 1480 355 1480 298 1420 313 1401 307 1378 321 1357 316Z"],
    details: "M46 316q7 21 33 29t41 26M71 334q7 15 26 21M159 346q12 18 35 23t31 15M270 367q18 10 49 14M403 378q30 4 45 10M988 349q-9 17-35 27m27-16q-9 15-18 16M1090 325q-12 17-8 29t-23 28m30-34q3 15 20 21M1238 337q-6 16-22 20M1357 321q-11 14-6 29t-13 23m26-39q5 14 20 24M1401 311q-7 18 5 33",
  },
  {
    key: "near", top: "#8d9998", bottom: "#adb1ab", ink: "#667c79",
    outline: "M-40 357Q5 349 31 356L49 353 70 364Q104 359 131 373L154 370Q188 382 213 379L238 388 269 384Q313 394 341 390L364 397Q394 394 421 401L453 399 480 406H827Q860 402 895 404L930 395 951 399Q986 386 1018 389L1041 381 1072 385Q1110 374 1140 379L1162 367 1186 371Q1227 357 1258 361L1282 353Q1313 359 1339 349L1367 352Q1402 340 1440 345L1480 337",
    faces: [],
    details: "M-4 363q35-6 70 11t73 8M49 373q18-4 45 6M153 378q31 9 62 10M232 392q31-3 65 6M1058 391q35-10 69-8M1141 385q18-10 42-9M1207 370q21-8 54-3M1297 365q21-9 47-8M1361 360q32-14 63-9",
  },
];

function Mountain({ range, id }: { range: (typeof ranges)[number]; id: string }) {
  const etch = range.key === "far" ? [[124, 239, -23, 69], [145, 260, 29, 66], [323, 301, 16, 48], [1056, 308, -19, 49], [1235, 281, 35, 64], [1328, 302, -23, 47]] : range.key === "middle" ? [[48, 321, 35, 45], [159, 350, 25, 34], [1090, 333, -20, 43], [1357, 329, 13, 45]] : [];
  return <g>
    <defs>
      <clipPath id={`${id}-${range.key}-clip`}><path d={`${range.outline}V411H-40Z`} /></clipPath>
      <linearGradient id={`${id}-${range.key}-shade`} x1="0.1" y1="0" x2="0.65" y2="1"><stop stopColor={range.ink} stopOpacity="0.65" /><stop offset="0.45" stopColor={range.ink} stopOpacity="0.35" /><stop offset="1" stopColor={range.ink} stopOpacity="0" /></linearGradient>
    </defs>
    <path d={`${range.outline}V411H-40Z`} fill={`url(#${id}-${range.key})`} />
    <g fill={`url(#${id}-${range.key}-shade)`} opacity={range.key === "distant" ? "0.32" : "0.55"} filter={`url(#${id}-terrain-soften)`} clipPath={`url(#${id}-${range.key}-clip)`}>
      {range.faces.map((d, i) => <path key={i} d={d} />)}
    </g>
    <path d={range.outline} fill="none" stroke={range.ink} strokeWidth="0.55" opacity="0.3" />
    <path d={range.details} fill="none" stroke={range.ink} strokeWidth="0.65" strokeLinecap="round" strokeLinejoin="round" opacity={range.key === "distant" ? "0.2" : "0.4"} />
    <g fill="none" stroke={range.ink} strokeWidth="0.45" strokeLinecap="round" opacity="0.32" clipPath={`url(#${id}-${range.key}-clip)`}>
      {etch.map(([x, y, dx, dy], patch) => <g key={patch}>
        {Array.from({ length: 9 }, (_, i) => {
          const sx = x + (i - 4) * 2.8;
          const sy = y + Math.sin(i * 1.7) * 5 + i * 1.6;
          const length = dy * (0.46 + (i % 4) * 0.12);
          return <path key={i} d={`M${sx} ${sy}c${dx * 0.28 - 3} ${length * 0.28} ${dx * 0.6 + Math.sin(i) * 5} ${length * 0.48} ${dx} ${length}m${-dx * 0.18} ${-length * 0.22}q${-8 + i} 1 ${-13 + i} ${8 + i % 3 * 2}`} />;
        })}
      </g>)}
    </g>
  </g>;
}

export function Landscape() {
  const id = useId().replaceAll(":", "");
  return <svg className={styles.landscape} viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">
    <defs>
      {ranges.map((range) => <linearGradient key={range.key} id={`${id}-${range.key}`} x2="0.15" y2="1"><stop stopColor={range.top} /><stop offset="1" stopColor={range.bottom} /></linearGradient>)}
      <linearGradient id={`${id}-reflection-fade`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="white" stopOpacity="0.5" /><stop offset="1" stopColor="black" /></linearGradient>
      <mask id={`${id}-reflection-mask`}><path d="M0 405h1440v240H0Z" fill={`url(#${id}-reflection-fade)`} /></mask>
      <filter id={`${id}-terrain-soften`} x="-3%" y="-3%" width="106%" height="106%"><feGaussianBlur stdDeviation="1.35" /></filter>
      <filter id={`${id}-water-blur`}><feGaussianBlur stdDeviation="1.6" /></filter>
      <linearGradient id={`${id}-sky`} x2="0" y2="1"><stop stopColor="#f3e9e2" /><stop offset="0.57" stopColor="#f1cbbd" /><stop offset="1" stopColor="#f7e9d9" /></linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor="#f9d8ac" stopOpacity="0.85" /><stop offset="1" stopColor="#f7d7bc" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-water`} x2="0" y2="1"><stop stopColor="#dec7c6" /><stop offset="0.42" stopColor="#e4c6b7" /><stop offset="1" stopColor="#b7b2a0" /></linearGradient>
      <linearGradient id={`${id}-bank`} x2="0" y2="1"><stop stopColor="#a7a592" stopOpacity="0.15" /><stop offset="1" stopColor="#667e72" stopOpacity="0.55" /></linearGradient>
    </defs>
    <path d="M0 0h1440v1000H0Z" fill={`url(#${id}-sky)`} />
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
    {ranges.map((range) => <Mountain key={range.key} range={range} id={id} />)}
    <path d="M0 405c231-8 432 7 718 0s441 6 722-1v596H0Z" fill={`url(#${id}-water)`} />
    <g mask={`url(#${id}-reflection-mask)`} opacity="0.24" filter={`url(#${id}-water-blur)`}>
      <path d={`${ranges[2].outline}V411H-40Z`} fill="#879090" transform="translate(0 813) scale(1 -1)" />
    </g>
    <g fill="none" strokeLinecap="round">
      {Array.from({ length: 165 }, (_, i) => {
        const y = 411 + i * 5.35;
        const x = (i * 137.5) % 1420 - 80;
        const width = 60 + (i * 51) % 325;
        return <path key={i} d={`M${x} ${y}q${width / 2} ${Math.sin(i) * 2} ${width} 0`} stroke="#97828d" strokeWidth={i % 3 ? "0.65" : "0.85"} opacity={0.28 - i * 0.00075} />;
      })}
      {Array.from({ length: 47 }, (_, i) => {
        const y = 411 + i * 2.2 + i * i * 0.1;
        const half = 11 + i * 2.9 + Math.sin(i * 1.8) * 17;
        return <path key={i} d={`M${950 - half} ${y}q${half * 0.45} ${Math.sin(i) * 1.3} ${half * 0.9} 0m${5 + i % 4 * 5} 0h${half * 0.55}`} stroke="#fff0d2" strokeWidth={1 + i % 3 * 0.35} opacity={0.72 - i * 0.013} />;
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
    <path d="M0 769C84 777 140 810 197 853L226 865Q287 894 334 931L360 940Q449 967 527 978L611 985 688 982Q798 989 888 965L932 962Q1027 949 1083 920L1112 914Q1194 864 1262 859L1304 852Q1372 838 1440 812V1000H0Z" fill={`url(#${id}-bank)`} />
    <g fill="none" stroke="#8f9380" strokeWidth="0.7" opacity="0.3">
      <path d="M0 793Q90 800 164 847T282 911M31 811Q95 818 132 849M0 837Q79 829 147 883T263 934M102 886Q145 885 193 920M0 909Q40 897 79 916M1194 894Q1276 851 1351 859T1440 839M1268 877Q1321 866 1362 874M1101 948Q1187 909 1241 918T1400 875M1274 918Q1352 892 1440 901M1343 940Q1397 916 1440 925" />
    </g>
    <g fill="none" strokeLinecap="round" stroke="#667c6b" opacity="0.58">
      {Array.from({ length: 42 }, (_, i) => {
        const x = i < 23 ? i * 8 - 20 : 1260 + (i - 23) * 12;
        const y = 1005 - Math.sin(i * 2.3) * 15;
        const h = 34 + (i * 47) % 165;
        const bend = Math.sin(i * 1.4) * 28 - 16;
        return <g key={i} strokeWidth={i % 3 ? "0.8" : "1.1"}>
          <path d={`M${x} ${y}q${bend / 3} -${h * 0.56} ${bend} -${h}`} />
          <path d={`M${x + bend * 0.17} ${y - h * 0.32}q-19 -8 -28 -31M${x + bend * 0.25} ${y - h * 0.47}q16 -11 21 -33`} />
          {i % 3 === 0 ? <path d={`M${x + bend} ${y - h}l-5 -13m5 13 2-16m-2 16-9-7m9 7 6-10`} /> : null}
        </g>;
      })}
    </g>
  </svg>;
}

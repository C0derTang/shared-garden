import { useId } from "react";
import styles from "./sunset-home.module.css";

// Each petal is a separate cupped surface. The spiral sits above and left of
// the deep outer bowl, so the blossom reads in three-quarter view, not head-on.
const petals = [
  { d: "M143 146C121 127 123 104 146 98 139 77 164 61 182 71 195 46 218 51 232 75 255 63 274 78 270 103 296 93 305 119 287 141 300 166 275 194 251 207 223 229 191 218 172 199 144 195 123 173 143 146Z", tone: "shadow" },
  { d: "M147 102C140 82 158 66 181 77 185 90 178 106 163 118Z", tone: "light" },
  { d: "M179 79C188 55 211 53 228 78 232 97 217 112 199 116 198 99 191 86 179 79Z", tone: "red" },
  { d: "M224 83C246 64 270 78 264 102 260 121 245 133 231 140 229 117 231 100 224 83Z", tone: "shadow" },
  { d: "M265 108C286 94 299 110 282 134 283 152 269 174 250 185 253 157 254 133 265 108Z", tone: "red" },
  { d: "M148 104C121 103 119 128 137 147 146 157 165 162 176 152 159 140 155 123 148 104Z", tone: "light" },
  { d: "M143 142C123 145 104 154 117 166 129 180 139 182 160 179 176 182 188 194 201 198 189 173 170 151 143 142Z", tone: "red" },
  { d: "M160 176C143 179 139 192 154 202 177 214 192 216 212 215 221 207 225 192 222 180 201 186 179 189 160 176Z", tone: "light" },
  { d: "M267 141C288 141 285 164 269 184 254 201 237 216 211 218 225 198 231 180 235 164 247 157 258 149 267 141Z", tone: "shadow" },
  { d: "M224 151C235 128 252 119 263 121 268 141 256 163 238 181 226 196 211 199 197 194 214 178 218 164 224 151Z", tone: "red" },
  { d: "M158 107C160 88 184 85 200 99 208 112 199 133 185 141 175 128 170 117 158 107Z", tone: "light" },
  { d: "M198 99C210 84 230 97 234 114 234 132 219 147 207 154 210 134 206 115 198 99Z", tone: "shadow" },
  { d: "M157 113C137 113 139 135 153 146 166 154 187 155 199 144 180 139 165 128 157 113Z", tone: "red" },
  { d: "M154 144C158 158 178 173 195 169 212 164 224 147 226 130 213 143 199 149 184 148 173 149 163 148 154 144Z", tone: "light" },
  { d: "M174 109C180 96 196 98 205 110 213 123 201 139 186 142 191 131 184 118 174 109Z", tone: "red" },
  { d: "M173 111C158 113 161 131 176 137 188 141 198 136 201 127 187 132 179 124 173 111Z", tone: "light" },
  { d: "M180 113C184 104 198 108 200 117 199 125 188 131 181 126 190 125 193 118 188 115Z", tone: "shadow" },
  { d: "M180 113C173 117 175 125 182 128 190 128 193 123 191 118 186 122 180 121 180 113Z", tone: "red" },
];

function Leaf({ x, y, rotate, scale = 1, gradient }: { x: number; y: number; rotate: number; scale?: number; gradient: string }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
    <g className={styles.leafFlutter} stroke="#526c5b" fill="none" strokeWidth="0.8">
      <path d="M0 0C17-13 29-39 81-48L77-40 85-42 78-33 84-34 76-25 80-25 71-17 75-17 65-9 66-6 54-3 53 1 40 1 36 5 24 3C13 4 5 1 0 0Z" fill={`url(#${gradient})`} />
      <path d="M0 0Q42-10 81-48" stroke="#d9c58e" strokeWidth="0.9" opacity="0.85" />
      {Array.from({ length: 9 }, (_, i) => <g key={i} opacity="0.65">
        <path d={`M${8 + i * 7.6} ${-2 - i * i * 0.48}q1 -${9 + i % 3 * 2} ${8 - i * 0.4} -${15 - i * 0.65}`} />
        <path d={`M${8 + i * 7.6} ${-2 - i * i * 0.48}q${10 - i * 0.4} 2 ${17 - i * 0.8} ${2 - i * 0.25}`} />
      </g>)}
      <path d="M2-2C20-15 31-38 81-48" stroke="#ead59a" opacity="0.85" />
    </g>
  </g>;
}

export function BotanicalRose() {
  const id = useId().replaceAll(":", "");
  return <svg className={styles.rose} viewBox="40 30 350 550" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-red`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e77c63" /><stop offset="0.34" stopColor="#c8474b" /><stop offset="1" stopColor="#822a43" /></linearGradient>
      <linearGradient id={`${id}-light`} x1="0" y1="0" x2="0.9" y2="1"><stop stopColor="#f2ae75" /><stop offset="0.16" stopColor="#db6253" /><stop offset="0.68" stopColor="#b73f4b" /><stop offset="1" stopColor="#932b42" /></linearGradient>
      <linearGradient id={`${id}-shadow`} x1="0" y1="0" x2="1" y2="0.8"><stop stopColor="#c64d4c" /><stop offset="0.4" stopColor="#9e3045" /><stop offset="1" stopColor="#63283d" /></linearGradient>
      <linearGradient id={`${id}-leaf`} x2="0.8" y2="1"><stop stopColor="#9ca77a" /><stop offset="0.45" stopColor="#728f72" /><stop offset="1" stopColor="#4e7161" /></linearGradient>
    </defs>
    <g className={styles.roseSway}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M313 573C289 513 296 463 275 407" stroke="#4f6b59" strokeWidth="3" />
        <path d="M311 572C287 510 293 463 273 407" stroke="#d7c58c" strokeWidth="0.8" />
        <path d="M295 493Q317 464 339 438" stroke="#58735d" strokeWidth="1.5" />
      </g>
      <Leaf x={339} y={438} rotate={-17} scale={0.7} gradient={`${id}-leaf`} />
      <g className={styles.upperSway}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M275 407C254 351 235 298 222 211" stroke="#4f6b59" strokeWidth="2.8" />
        <path d="M273 407C252 351 232 296 220 212" stroke="#d7c58c" strokeWidth="0.8" />
        <path d="M253 347Q283 322 306 279M278 422Q252 397 219 379M269 397Q257 364 242 345" stroke="#58735d" strokeWidth="1.5" />
        <path d="m249 341-8-11 6 1m26 76 8-10-3 18m6 32-8-9 6 2" fill="#799071" stroke="#526d5a" strokeWidth="0.8" />
      </g>
      <Leaf x={306} y={279} rotate={-8} scale={0.91} gradient={`${id}-leaf`} />
      <Leaf x={286} y={313} rotate={40} scale={0.72} gradient={`${id}-leaf`} />
      <Leaf x={219} y={379} rotate={192} scale={1.03} gradient={`${id}-leaf`} />
      <Leaf x={242} y={345} rotate={199} scale={0.72} gradient={`${id}-leaf`} />
      <g className={styles.bloomNod}>
        <g stroke="#58715a" strokeWidth="0.8" fill="#668164">
          <path d="M217 208Q192 226 177 219Q201 219 205 197L223 196Q242 196 257 185Q249 211 231 221L225 216Q237 240 244 243Q229 236 219 222Q208 242 199 249Q204 228 217 208Z" />
        </g>
        <g transform="rotate(-18 220 211)" stroke="#8e3546" strokeWidth="0.85" strokeLinejoin="round">
          {petals.map(({ d, tone }, i) => <path key={i} d={d} fill={`url(#${id}-${tone})`} />)}
          <g fill="none" stroke="#f5d295" strokeLinecap="round" strokeWidth="1.2" opacity="0.88">
            <path d="M147 102C140 82 158 66 181 77M179 79C188 55 211 53 228 78M224 83C246 64 264 74 265 91M148 104C124 104 120 124 133 140M142 143C124 147 109 154 118 165M158 179C148 185 145 191 154 199M158 107C160 88 184 85 200 99M157 113C139 114 141 133 153 144M154 144C166 155 181 156 199 144M178 110C185 101 195 107 200 117M174 113C162 116 165 130 177 135M181 115Q176 122 183 126" />
          </g>
          <g fill="none" stroke="#f3b78e" strokeWidth="0.5" opacity="0.5">
            <path d="M150 91q6-13 20-10m-18 13q7-13 20-11M192 70q16-9 27 10m-25-7q12-5 22 9M137 117q-7 11 8 23m-4-23q-6 9 8 20M125 157q17-1 34 13m-31-10q17 0 31 13M155 191q19 11 36 12m-32-16q19 12 33 12M247 86q13 10 6 29m-9-24q10 11 4 25M277 117q-3 10-13 22M259 148q-4 18-18 30m13-27q-4 17-16 27M269 162q-12 25-34 37m29-34q-10 21-28 30M172 101q13-7 23 8m-20-5q11-3 17 7M171 152q15 10 30-3m-25 7q15 5 26-6" />
          </g>
          <g fill="none" stroke="#65283b" strokeWidth="0.65" opacity="0.45">
            <path d="M200 84q12 16 7 24M235 102q9 18-3 35M226 156q-5 20-22 31M153 151q12 15 23 20M180 202q19 11 33 5M244 180q-9 19-23 28" />
          </g>
        </g>
      </g>
      </g>
    </g>
  </svg>;
}

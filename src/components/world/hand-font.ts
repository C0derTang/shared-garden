import localFont from "next/font/local";

/**
 * Gochi Hand, a handwritten face bundled from the repository (SIL Open Font
 * License 1.1, see ./fonts/OFL-gochi-hand.txt). No remote font requests.
 */
export const handFont = localFont({
  src: "./fonts/gochi-hand-latin-400-normal.woff2",
  weight: "400",
  display: "swap",
  fallback: ["Bradley Hand", "Segoe Print", "Comic Sans MS", "cursive"],
});

import { Ma_Shan_Zheng } from "next/font/google";

/** Brush-kaishu display face, self-hosted by next/font; no runtime third-party request. */
export const lyricFont = Ma_Shan_Zheng({
  weight: "400",
  preload: false,
  display: "swap",
  fallback: ["Kaiti SC", "STKaiti", "KaiTi", "serif"],
});

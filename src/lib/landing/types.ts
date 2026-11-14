/** Private entry groups on the authenticated homepage. */
export const landingFlowers = ["rose", "marigold", "tulip"] as const;
export type LandingFlower = (typeof landingFlowers)[number];
export type LandingEntry = {
  id: string;
  flower: LandingFlower;
  /** Safe plain text excerpt; Tulip uses title and artist. */
  text: string;
  author: string | null;
  /** Pacific garden day, YYYY-MM-DD. */
  day: string;
};
export type LandingData =
  | {
      status: "member";
      entries: Record<LandingFlower, LandingEntry[]>;
      unavailable?: LandingFlower[];
    }
  | { status: "visitor" };

/**
 * The order the garden's hidden keyboard plot list reads its spots in (#210):
 * bed by bed, row by row. Beds go in the order they opened (bed 1 in the middle of
 * the meadow, then the beds that opened around it), so their numbers only
 * ever grow as you step on. Within a bed, spots go row by row from the back
 * of the bed (the top of the screen) to the front, left to right within a
 * row, like reading the bed as the camera sees it.
 */

import { BED_RADIUS, SPOTS_PER_BED, bedAt, spotPosition } from "./layout";

/** Rows a bed's twelve spots are read in. */
const ROWS_PER_BED = 4;

/** Row (0 = back) of a spot within its bed. */
export function spotRow(spot: number): number {
  const place = spotPosition(spot);
  const centre = bedAt(place.bed).center;
  const reach = BED_RADIUS * 0.8;
  const t = (place.position[2] - centre[2] + reach) / (2 * reach);
  return Math.min(ROWS_PER_BED - 1, Math.max(0, Math.floor(t * ROWS_PER_BED)));
}

/** The spots of one bed in reading order (one-based). */
export function bedSpotOrder(bed: number): number[] {
  const spots = Array.from({ length: SPOTS_PER_BED }, (_, k) => bed * SPOTS_PER_BED + k + 1);
  return spots
    .map((spot) => ({ spot, row: spotRow(spot), x: spotPosition(spot).position[0] }))
    .sort((a, b) => a.row - b.row || a.x - b.x || a.spot - b.spot)
    .map((entry) => entry.spot);
}

/** Every spot from 1 to `capacity` in navigator order. */
export function plotOrder(capacity: number): number[] {
  const count = Math.max(0, Math.floor(capacity));
  const beds = Math.ceil(count / SPOTS_PER_BED);
  return Array.from({ length: beds }, (_, bed) => bed).flatMap((bed) => bedSpotOrder(bed).filter((spot) => spot <= count));
}

/** Zero-based bed of a one-based spot. */
export const bedOfSpot = (spot: number) => Math.floor((spot - 1) / SPOTS_PER_BED);


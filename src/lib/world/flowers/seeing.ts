/** When a waiting dandelion counts as seen in the world (#201, #206). Pure, so it is shared with tests. */

import type { Vec3 } from "../layout";

/**
 * A waiting dandelion's seeds blow once the camera is within this distance
 * (world units) and the flower is in view: close enough to see the seeds,
 * which are only a few pixels across from the overview. A bed the plot
 * navigator frames counts as seen too, once the framing has settled (#206).
 * Until then they wait, still a puff.
 */
export const SEE_NEAR = 6.4;

/** True when a flower head projects inside the view (a little inside its edges). Allocation-free. */
export function headOnScreen(m: Float32Array, head: Vec3, margin = 0.9): boolean {
  const [x, y, z] = head;
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  if (w <= 1e-6) return false;
  const nx = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
  const ny = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
  const nz = (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w;
  return Math.abs(nx) <= margin && Math.abs(ny) <= margin && nz < 1;
}

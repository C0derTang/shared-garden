import type { Vec3 } from "@/lib/world/layout";
import type { FlowerAnchor } from "@/lib/world/picking";
import { hexToLinear } from "@/lib/world/sky-palette";
import { STROKE_KIND, createRandom, jitterColor, type Stroke } from "@/lib/world/strokes";

const PETALS = ["#f2a7b8", "#f6efe2", "#f3cf5c", "#b9a6e8", "#ee8a6d", "#e86f8a"].map((hex) => hexToLinear(hex) as Vec3);
const STEM = hexToLinear("#4d7a33") as Vec3;
const HEART = hexToLinear("#e3a93a") as Vec3;

/**
 * Dev-only placeholder blooms painted with the shared brush: a stem, two
 * leaves and a ring of petal strokes per anchor. The real procedural flowers
 * arrive with #179; this only proves the stroke layer hook.
 */
export function standInFlowerStrokes(anchors: readonly FlowerAnchor[]): Stroke[] {
  const strokes: Stroke[] = [];
  anchors.forEach((anchor, index) => {
    const random = createRandom(0xf10e + index * 7919);
    const [x, y, z] = anchor.position;
    const height = 0.55 + random() * 0.3;
    const lean = (random() - 0.5) * 0.15;
    strokes.push({
      kind: STROKE_KIND.blade,
      origin: [x, y - 0.02, z],
      axis: [lean, height, 0],
      width: 0.035,
      bend: (random() - 0.5) * 0.3,
      seed: random(),
      normal: [0, 0.7, 0.7],
      color: STEM,
      extra: 0.2,
    });
    for (const side of [-1, 1]) {
      strokes.push({
        kind: STROKE_KIND.blade,
        origin: [x, y + height * (0.2 + random() * 0.2), z],
        axis: [side * (0.18 + random() * 0.08), 0.12, 0.02],
        width: 0.07,
        bend: side * 0.3,
        seed: random(),
        normal: [0, 0.8, 0.6],
        color: jitterColor(STEM, random, 0.12),
        extra: 0.3,
      });
    }
    const head: Vec3 = [x + lean, y + height, z];
    const color = PETALS[index % PETALS.length]!;
    const petals = 9 + Math.floor(random() * 6);
    for (let p = 0; p < petals; p += 1) {
      const a = (p / petals) * Math.PI * 2 + random() * 0.2;
      const length = 0.13 + random() * 0.05;
      strokes.push({
        kind: STROKE_KIND.petal,
        origin: [head[0] + Math.cos(a) * 0.02, head[1] + Math.sin(a) * 0.02, head[2] + 0.01],
        axis: [Math.cos(a) * length, Math.sin(a) * length * 0.85, 0.02],
        width: 0.075 + random() * 0.02,
        bend: (random() - 0.5) * 0.4,
        seed: random(),
        normal: [0, 0.4, 1],
        color: jitterColor(color, random, 0.1),
        extra: 0.15,
      });
    }
    for (let c = 0; c < 4; c += 1) {
      const a = random() * Math.PI * 2;
      strokes.push({
        kind: STROKE_KIND.petal,
        origin: [head[0] - Math.cos(a) * 0.025, head[1] - Math.sin(a) * 0.025, head[2] + 0.03],
        axis: [Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0],
        width: 0.05,
        bend: 0,
        seed: random(),
        normal: [0, 0.4, 1],
        color: jitterColor(HEART, random, 0.1),
        extra: 0.1,
      });
    }
  });
  return strokes;
}

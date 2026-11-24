import { describe, expect, it } from "vitest";
import { flowerModel, placeWorldFlowers, worldFlowerAnchors } from "./flower-models";

describe("world flower models", () => {
  const flowers = [
    { id: "a", spec: { type: "sunflower" as const, seed: 1, growth: 1 }, position: [1, 0, 2] as [number, number, number] },
    { id: "b", spec: { type: "forget-me-not" as const, seed: 2, growth: 0.1 }, position: [0, 0, 0] as [number, number, number] },
  ];

  it("caches immutable models per spec", () => {
    expect(flowerModel(flowers[0]!.spec)).toBe(flowerModel({ ...flowers[0]!.spec }));
    expect(flowerModel({ type: "rose", seed: 1, growth: 1 / 3 })).toBe(flowerModel({ type: "rose", seed: 1, growth: 0.3333 }));
  });

  it("gives pick targets the flower's real size", () => {
    const [tall, small] = worldFlowerAnchors(flowers);
    expect(tall!.id).toBe("a");
    expect(tall!.height).toBeGreaterThan(small!.height!);
    expect(small!.height).toBeGreaterThanOrEqual(0.25);
    expect(tall!.position).toEqual([1, 0, 2]);
  });

  it("turns flowers near the camera-facing direction, deterministically", () => {
    const placed = placeWorldFlowers(flowers);
    expect(placeWorldFlowers(flowers).map((p) => p.placement)).toEqual(placed.map((p) => p.placement));
    for (const p of placed) expect(Math.abs(p.placement.yaw)).toBeLessThanOrEqual(0.55);
  });
});

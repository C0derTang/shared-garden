import { describe, expect, it } from "vitest";
import {
  MAX_SHELLS,
  MAX_SPARKS,
  SHELL_FLOATS,
  SHELL_TYPES,
  SPARK_FLOATS,
  SPARK_KIND,
  STILL_MOMENT,
  buildFireworksShow,
  burstTime,
  fireworksLightAt,
  flashAt,
  packFireworks,
  rocketPosition,
} from "./fireworks";
import { WATER_LEVEL, shorelineZ } from "./layout";

describe("fireworks show", () => {
  const show = buildFireworksShow(1234);

  it("runs about half a minute with every shell type", () => {
    expect(show.duration).toBeGreaterThanOrEqual(20);
    expect(show.duration).toBeLessThanOrEqual(40);
    expect(new Set(show.shells.map((shell) => shell.type))).toEqual(new Set(SHELL_TYPES));
    expect(show.shells.length).toBeLessThanOrEqual(MAX_SHELLS);
  });

  it("is deterministic for a seed and varies between seeds", () => {
    expect(buildFireworksShow(1234)).toEqual(show);
    expect(buildFireworksShow(99).shells[0]!.burst).not.toEqual(show.shells[0]!.burst);
  });

  it("launches from the water and bursts above the lake", () => {
    for (const shell of show.shells) {
      expect(shell.base[1]).toBe(WATER_LEVEL);
      expect(shell.base[2]).toBeLessThan(shorelineZ(shell.base[0]) - 30);
      expect(shell.burst[1]).toBeGreaterThan(9);
      expect(Math.abs(shell.burst[0])).toBeLessThanOrEqual(28);
      expect(rocketPosition(shell, 0)).toEqual(shell.base);
      expect(rocketPosition(shell, shell.flight)[1]).toBeCloseTo(shell.burst[1]);
    }
  });

  it("packs within the GPU pool with one rocket per shell", () => {
    for (const seed of [1, 2, 3, 1234, 0xfffffff]) {
      const packed = packFireworks(buildFireworksShow(seed), seed);
      expect(packed.sparkCount).toBeLessThanOrEqual(MAX_SPARKS);
      expect(packed.sparks.length).toBe(packed.sparkCount * SPARK_FLOATS);
      expect(packed.shells.length).toBe(packed.shellCount * SHELL_FLOATS);
      let rockets = 0;
      for (let i = 0; i < packed.sparkCount; i += 1) {
        const life = packed.sparks[i * SPARK_FLOATS + 7]!;
        expect(life).toBeGreaterThan(0);
        expect(Number.isFinite(packed.sparks[i * SPARK_FLOATS + 3]!)).toBe(true);
        if (packed.sparks[i * SPARK_FLOATS + 12] === SPARK_KIND.rocket) rockets += 1;
      }
      expect(rockets).toBe(packed.shellCount);
    }
  });

  it("lights the scene only while bursts are open", () => {
    const first = Math.min(...show.shells.map(burstTime));
    expect(fireworksLightAt(show, first - 0.01)).toBeNull();
    const light = fireworksLightAt(show, first + 0.1);
    expect(light?.level).toBeGreaterThan(0.5);
    expect(fireworksLightAt(show, show.duration + 10)).toBeNull();
    expect(flashAt(-1)).toBe(0);
    expect(flashAt(0)).toBeGreaterThan(flashAt(1));
  });
});

describe("still fireworks (reduced motion)", () => {
  const still = buildFireworksShow(42, { still: true });

  it("holds several different bursts, all open at its moment", () => {
    expect(still.still).toBe(true);
    expect(still.shells.length).toBe(5);
    expect(new Set(still.shells.map((shell) => shell.type)).size).toBe(5);
    for (const shell of still.shells) {
      const age = STILL_MOMENT - burstTime(shell);
      expect(age).toBeGreaterThan(0.4);
      expect(age).toBeLessThan(1);
    }
    expect(fireworksLightAt(still, STILL_MOMENT)?.level).toBeGreaterThan(0);
  });
});

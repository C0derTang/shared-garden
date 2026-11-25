import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldLayerSetup } from "../world-layer";
import type { WorldFlower } from "./flower-models";

type FakeBatch = {
  id: number;
  /** The flowers it paints (as the layer chose to draw them). */
  set: readonly WorldFlower[];
  compile: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  encode: ReturnType<typeof vi.fn>;
};
const fake = vi.hoisted(() => ({
  batches: [] as FakeBatch[],
  /** Per build: throw, or a compile result to settle later. */
  plan: [] as ("throw" | "deferred")[],
  settle: [] as { resolve: () => void; reject: (error: unknown) => void }[],
}));

vi.mock("./flower-batch", () => ({
  createFlowerBatch: (_gpu: unknown, packed: { set?: readonly WorldFlower[] }) => {
    if (fake.plan.shift() === "throw") throw new Error("synthetic build failure");
    const id = fake.batches.length;
    const batch: FakeBatch = {
      id,
      set: packed.set ?? [],
      compile: vi.fn(
        () =>
          new Promise<void>((resolve, reject) => {
            fake.settle[id] = { resolve, reject };
          }),
      ),
      dispose: vi.fn(),
      encode: vi.fn(),
    };
    fake.batches.push(batch);
    return {
      ...batch,
      setWorld: vi.fn(),
      setParams: vi.fn(),
      setShadowParams: vi.fn(),
      encodeAura: vi.fn(),
      encodeShadow: vi.fn(),
    };
  },
}));
vi.mock("@/lib/world/flowers/generate", () => ({ packFlowers: (set: unknown) => ({ set }), flowerPhase: () => 0.25, flowerYaw: () => 0 }));
vi.mock("./flower-models", () => ({
  placeWorldFlowers: (set: unknown) => set,
  quantisedGrowth: (growth: number) => growth,
  flowerModel: (spec: { puff?: boolean }) => ({ height: 0.3, puffSeeds: spec.puff ? [{}] : [] }),
}));
// The seeds' GPU work is recorded instead (#201), with the real slot rules:
// held blows are never evicted; a full set of slots refuses new held blows.
const drift = vi.hoisted(() => ({
  capacity: 8,
  slots: [] as ({ x: number; held: boolean } | null)[],
  blows: [] as { hold: boolean; still: boolean; x: number }[],
  releases: [] as { slot: number; still: boolean; x: number }[],
}));
vi.mock("./seed-drift", () => ({
  createSeedDrift: () => ({
    get hasFreeSlot() {
      return drift.slots.filter(Boolean).length < drift.capacity;
    },
    get allHeld() {
      return drift.slots.filter((slot) => slot?.held).length === drift.capacity;
    },
    blow: (blow: { still: boolean; placement: { position: number[] } }, options?: { hold?: boolean }) => {
      let slot = -1;
      for (let i = 0; i < drift.capacity && slot < 0; i += 1) if (!drift.slots[i]) slot = i;
      if (slot < 0) return -1;
      const x = blow.placement.position[0]!;
      drift.slots[slot] = { x, held: options?.hold === true };
      drift.blows.push({ hold: options?.hold === true, still: blow.still, x });
      return slot;
    },
    release: (slot: number, breeze: { still: boolean }) => {
      const held = drift.slots[slot]!;
      held.held = false;
      drift.releases.push({ slot, still: breeze.still, x: held.x });
    },
    step: vi.fn(),
    setWorld: vi.fn(),
    setParams: vi.fn(),
    encode: vi.fn(),
    encodeDetail: vi.fn(),
    compile: () => Promise.resolve(),
    dispose: vi.fn(),
  }),
}));

const { createFlowerLayer } = await import("./flower-layer");

const flower = (id: string): WorldFlower => ({ id, spec: { type: "rose", seed: 1, growth: 1 }, position: [0, 0, 0] }) as WorldFlower;
const context = { gpu: {}, shadow: {}, sceneTarget: {} } as unknown as WorldLayerSetup;
/** A flat camera: a point's clip position is its world position, shifted so x = eye x is the middle of the view. */
const frameAt = (eye: [number, number, number]) =>
  ({
    world: { camRight: [1, 0, 0] },
    viewProjection: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -eye[0], 0, 0, 1]),
    eye,
    reducedMotion: false,
    hoveredFlowerId: null,
    lighting: { glow: 0, night: 0 },
  }) as never;
const frame = { ...(frameAt([0, 0.3, 1]) as object), reducedMotion: true } as never;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Which fake batch the layer draws now. */
function drawn(layer: ReturnType<typeof createFlowerLayer>) {
  for (const batch of fake.batches) batch.encode.mockClear();
  layer.draw!({} as never, frame);
  return fake.batches.find((batch) => batch.encode.mock.calls.length > 0)?.id;
}

beforeEach(() => {
  drift.blows = [];
  drift.releases = [];
  drift.slots = [];
  drift.capacity = 8;
  fake.batches = [];
  fake.plan = [];
  fake.settle = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function ready() {
  const layer = createFlowerLayer([flower("a")]);
  const setup = layer.setup!(context);
  fake.settle[0]!.resolve();
  await setup;
  return layer;
}

describe("flower layer rebuilds", () => {
  it("keeps an in-flight rebuild when a later build throws", async () => {
    const layer = await ready();
    layer.setFlowers([flower("a"), flower("b")]);
    await flush(); // batch 1 is compiling
    fake.plan.push("throw");
    layer.setFlowers([flower("a"), flower("b"), flower("c")]);
    await flush(); // the next build throws
    fake.settle[1]!.resolve();
    await flush();
    expect(drawn(layer)).toBe(1);
    expect(fake.batches[0]!.dispose).toHaveBeenCalled();
    expect(fake.batches[1]!.dispose).not.toHaveBeenCalled();
  });

  it("never swaps in flowers whose pipelines failed to compile", async () => {
    const layer = await ready();
    layer.setFlowers([flower("a"), flower("b")]);
    await flush();
    fake.settle[1]!.reject(new Error("synthetic compile failure"));
    await flush();
    expect(drawn(layer)).toBe(0);
    expect(fake.batches[1]!.dispose).toHaveBeenCalled();
    expect(fake.batches[0]!.dispose).not.toHaveBeenCalled();
  });

  it("discards a superseded rebuild", async () => {
    const layer = await ready();
    layer.setFlowers([flower("a"), flower("b")]);
    await flush();
    layer.setFlowers([flower("a"), flower("c")]);
    await flush();
    fake.settle[2]!.resolve();
    fake.settle[1]!.resolve();
    await flush();
    expect(drawn(layer)).toBe(2);
    expect(fake.batches[1]!.dispose).toHaveBeenCalled();
  });
});

describe("a dandelion's seeds blowing away (#201)", () => {
  const dandelion = (id: string, puff: boolean, position: [number, number, number] = [0, 0, 0]): WorldFlower =>
    ({ id, spec: { type: "dandelion", seed: 3, growth: 1, ...(puff ? { puff: true } : {}) }, position }) as WorldFlower;
  const step = { dt: 0.016, reducedMotion: false } as never;

  async function golden(set: WorldFlower[]) {
    const layer = createFlowerLayer(set);
    const setup = layer.setup!(context);
    fake.settle[fake.batches.length - 1]!.resolve();
    await setup;
    return layer;
  }

  it("waits while the puff is still drawn, then holds the seeds until the flower is near and in view", async () => {
    const layer = createFlowerLayer([dandelion("d", true)]);
    const setup = layer.setup!(context);
    fake.settle[0]!.resolve();
    await setup;
    const onStart = vi.fn();
    layer.blowSeeds("d", { onStart });
    layer.update!({} as never, step);
    expect(drift.blows).toHaveLength(0);

    // The wish comes true: the layer keeps painting the puff, then holds its
    // seeds (exactly over it) and only then swaps the golden head in beneath.
    layer.setFlowers([dandelion("d", false)]);
    await flush();
    fake.settle[1]!.resolve();
    await flush();
    expect(fake.batches[1]!.set[0]!.spec.puff).toBe(true);
    layer.draw!({} as never, frameAt([0, 0.3, 30]));
    layer.update!({} as never, step);
    expect(drift.blows).toEqual([{ hold: true, still: false, x: 0 }]);
    await flush();
    fake.settle[2]!.resolve();
    await flush();
    expect(fake.batches[2]!.set[0]!.spec.puff).toBeUndefined();
    layer.draw!({} as never, frameAt([0, 0.3, 30]));
    layer.update!({} as never, step);
    expect(drift.releases).toHaveLength(0);

    // Walking closer lets them go, once.
    layer.draw!({} as never, frameAt([0, 0.3, 2]));
    layer.update!({} as never, step);
    layer.update!({} as never, step);
    expect(drift.releases).toEqual([{ slot: 0, still: false, x: 0 }]);
    await flush();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(drift.blows).toHaveLength(1);
  });

  it("does not start before the first painted frame, off screen or while deferred", async () => {
    const layer = await golden([dandelion("d", false, [5, 0, 0])]);
    layer.blowSeeds("d");
    layer.update!({} as never, step);
    expect(drift.blows).toHaveLength(1);
    expect(drift.releases).toHaveLength(0);
    layer.draw!({} as never, frameAt([0, 0.3, 2])); // near, but off to the side of the view
    layer.update!({} as never, step);
    expect(drift.releases).toHaveLength(0);

    const near = await golden([dandelion("e", false)]);
    near.blowSeeds("e");
    near.deferSeeds("e");
    near.draw!({} as never, frameAt([0, 0.3, 2]));
    near.update!({} as never, step);
    expect(drift.releases).toHaveLength(0);
    near.deferSeeds(null);
    near.update!({} as never, step);
    expect(drift.releases).toHaveLength(1);
  });

  it("counts a bed the plot navigator frames as seen, once the framing has settled (#206)", async () => {
    const layer = await golden([dandelion("d", false, [0, 0, 0])]);
    layer.blowSeeds("d");
    layer.update!({} as never, step);
    expect(drift.blows).toHaveLength(1);
    // In view but beyond SEE_NEAR: it waits.
    layer.draw!({} as never, frameAt([0, 0.3, 9]));
    layer.update!({} as never, step);
    expect(drift.releases).toHaveLength(0);
    // Another bed framed: still waiting.
    layer.draw!({} as never, { ...(frameAt([0, 0.3, 9]) as object), framedBed: { center: [6, 0, 0], radius: 1.3 } } as never);
    layer.update!({} as never, step);
    expect(drift.releases).toHaveLength(0);
    // Its own bed framed: it blows.
    layer.draw!({} as never, { ...(frameAt([0, 0.3, 9]) as object), framedBed: { center: [0.4, 0, 0.3], radius: 1.3 } } as never);
    layer.update!({} as never, step);
    expect(drift.releases).toHaveLength(1);
  });

  it("fades the puff in place under reduced motion", async () => {
    const layer = await golden([dandelion("d", false)]);
    layer.blowSeeds("d");
    layer.draw!({} as never, frameAt([0, 0.3, 2]));
    layer.update!({} as never, { dt: 0.016, reducedMotion: true } as never);
    expect(drift.releases).toEqual([{ slot: 0, still: true, x: 0 }]);
  });

  it("ignores a repeated request while one waits, and drops requests for flowers that are not bloomed dandelions", async () => {
    const layer = await golden([dandelion("d", false), flower("r")]);
    layer.blowSeeds("d");
    layer.blowSeeds("d");
    layer.blowSeeds("r");
    layer.blowSeeds("gone");
    expect(layer.waitingSeeds).toBe(3);
    layer.update!({} as never, step);
    // The rose and the missing flower are no longer scanned; the dandelion waits, held.
    expect(layer.waitingSeeds).toBe(1);
    layer.draw!({} as never, frameAt([0, 0.3, 2]));
    layer.update!({} as never, step);
    expect(drift.blows).toHaveLength(1);
    expect(drift.releases).toHaveLength(1);
    expect(layer.waitingSeeds).toBe(0);
  });

  it("keeps its seeds when the flowers change while the world is still compiling", async () => {
    const layer = createFlowerLayer([dandelion("d", true)]);
    const setup = layer.setup!(context);
    // The page's first flowers arrive before the first batch has compiled: a rebuild supersedes it.
    layer.setFlowers([dandelion("d", false)]);
    await flush();
    fake.settle[0]!.resolve();
    await setup;
    fake.settle[1]!.resolve();
    await flush();
    expect(fake.batches[0]!.dispose).toHaveBeenCalled();
    layer.blowSeeds("d");
    layer.draw!({} as never, frameAt([0, 0.3, 2]));
    layer.update!({} as never, step);
    expect(drift.blows).toEqual([{ hold: true, still: false, x: 0 }]);
    expect(drift.releases).toHaveLength(1);
  });

  /** How each batch built so far paints flower `id` ("puff" or "golden"). */
  const looks = (id: string) => fake.batches.map((batch) => batch.set.find((f) => f.id === id)?.spec.puff === true ? "puff" : "golden");
  /** Lets every compiling batch finish (the newest one is swapped in). */
  async function compileAll() {
    await flush();
    for (const settle of fake.settle) settle?.resolve();
    await flush();
  }

  it("keeps painting the puff while every slot is busy with flying seeds, and holds it once one frees", async () => {
    const layer = createFlowerLayer([dandelion("a", false), dandelion("b", true, [20, 0, 0])]);
    const setup = layer.setup!(context);
    fake.settle[0]!.resolve();
    await setup;
    drift.capacity = 1;
    layer.blowSeeds("a");
    layer.draw!({} as never, frameAt([0, 0.3, 2]));
    layer.update!({} as never, step); // a is held and released at once: its seeds fly, using the only slot
    expect(drift.releases.map((r) => r.x)).toEqual([0]);

    // b's wish comes true (as the page does: new flowers and the request together).
    layer.setFlowers([dandelion("a", false), dandelion("b", false, [20, 0, 0])]);
    layer.blowSeeds("b");
    await compileAll();
    for (let frame = 0; frame < 5; frame += 1) {
      layer.update!({} as never, step);
      await compileAll();
    }
    // No slot yet: every batch built since still paints b's puff — never its golden head.
    expect(looks("b")).toEqual(["puff", "puff"]);
    expect(drift.blows).toHaveLength(1);

    drift.slots[0] = null; // a's seeds have faded
    layer.update!({} as never, step);
    // b's seeds are held (exactly over the painted puff), and only then is the golden head swapped in beneath them.
    expect(drift.blows.at(-1)).toEqual({ hold: true, still: false, x: 20 });
    await compileAll();
    expect(looks("b")).toEqual(["puff", "puff", "golden"]);
    layer.draw!({} as never, frameAt([20, 0.3, 2]));
    layer.update!({} as never, step);
    expect(drift.releases.map((r) => r.x)).toEqual([0, 20]);
  });

  it("never blows under the arrival's light, and goes once it has settled", async () => {
    const layer = await golden([dandelion("d", false)]);
    layer.holdSeeds(true);
    layer.blowSeeds("d");
    layer.draw!({} as never, frameAt([0, 0.3, 2]));
    layer.update!({} as never, step);
    expect(drift.blows).toHaveLength(1);
    expect(drift.releases).toHaveLength(0);
    layer.holdSeeds(false);
    layer.update!({} as never, step);
    expect(drift.releases).toHaveLength(1);
  });

  it("never lets a waiting blow steal another's slot, and the extra ones keep their puff until a slot frees", async () => {
    // Ten dandelions far apart along x; all their wishes come true at once.
    const puffs = Array.from({ length: 10 }, (_, k) => dandelion(`d${k}`, true, [k * 20, 0, 0]));
    const golden10 = puffs.map((f) => dandelion(f.id, false, f.position as [number, number, number]));
    const layer = createFlowerLayer(puffs);
    const setup = layer.setup!(context);
    fake.settle[0]!.resolve();
    await setup;
    const started = puffs.map(() => vi.fn());
    layer.setFlowers(golden10);
    golden10.forEach((f, k) => layer.blowSeeds(f.id, { onStart: started[k] }));
    await compileAll();
    layer.draw!({} as never, frameAt([500, 0.3, 2])); // nothing near
    layer.update!({} as never, step);
    // The eight earliest are held, each in its own slot; two wait without one.
    expect(drift.blows.map((b) => [b.hold, b.x])).toEqual(golden10.slice(0, 8).map((_, k) => [true, k * 20]));
    expect(new Set(drift.slots.map((slot) => slot!.x)).size).toBe(8);
    await compileAll();
    layer.update!({} as never, step);
    await compileAll();
    expect(drift.blows).toHaveLength(8);
    expect(layer.waitingSeeds).toBe(10);
    // The held ones show their golden head beneath their held seeds; the other two still paint their puff.
    const last = fake.batches.at(-1)!;
    expect(last.set.map((f) => (f.spec.puff ? "puff" : "golden"))).toEqual([...Array(8).fill("golden"), "puff", "puff"]);
    // …and no batch ever painted those two golden.
    expect(looks("d8").every((look) => look === "puff")).toBe(true);
    expect(looks("d9").every((look) => look === "puff")).toBe(true);

    // Walking up to the third: its own seeds go, and only its own start fires.
    layer.draw!({} as never, frameAt([40, 0.3, 2]));
    layer.update!({} as never, step);
    expect(drift.releases).toEqual([{ slot: 2, still: false, x: 40 }]);
    await flush();
    expect(started.map((fn) => fn.mock.calls.length)).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);

    // Its seeds fade and free the slot: the ninth is held there, then swapped golden beneath; the tenth keeps its puff.
    drift.slots[2] = null;
    layer.update!({} as never, step);
    expect(drift.blows.at(-1)).toEqual({ hold: true, still: false, x: 160 });
    await compileAll();
    expect(fake.batches.at(-1)!.set.map((f) => (f.spec.puff ? "puff" : "golden")).slice(8)).toEqual(["golden", "puff"]);
    layer.draw!({} as never, frameAt([160, 0.3, 2]));
    layer.update!({} as never, step);
    await flush();
    expect(started[8]).toHaveBeenCalledTimes(1);
    expect(started[9]).not.toHaveBeenCalled();
    expect(layer.waitingSeeds).toBe(8);
  });
});

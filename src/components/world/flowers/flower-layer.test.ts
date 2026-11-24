import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldLayerSetup } from "../world-layer";
import type { WorldFlower } from "./flower-models";

type FakeBatch = { id: number; compile: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; encode: ReturnType<typeof vi.fn> };
const fake = vi.hoisted(() => ({
  batches: [] as FakeBatch[],
  /** Per build: throw, or a compile result to settle later. */
  plan: [] as ("throw" | "deferred")[],
  settle: [] as { resolve: () => void; reject: (error: unknown) => void }[],
}));

vi.mock("./flower-batch", () => ({
  createFlowerBatch: () => {
    if (fake.plan.shift() === "throw") throw new Error("synthetic build failure");
    const id = fake.batches.length;
    const batch: FakeBatch = {
      id,
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
vi.mock("@/lib/world/flowers/generate", () => ({ packFlowers: () => ({}), flowerPhase: () => 0.25, flowerYaw: () => 0 }));
vi.mock("./flower-models", () => ({
  placeWorldFlowers: (set: unknown) => set,
  quantisedGrowth: (growth: number) => growth,
  flowerModel: (spec: { puff?: boolean }) => ({ height: 0.3, puffSeeds: spec.puff ? [{}] : [] }),
}));
// The seeds' GPU work is recorded instead (#201).
const drift = vi.hoisted(() => ({ blows: [] as { hold: boolean; still: boolean }[], releases: [] as { slot: number; still: boolean }[], steps: 0 }));
vi.mock("./seed-drift", () => ({
  createSeedDrift: () => ({
    blow: (blow: { still: boolean }, options?: { hold?: boolean }) => drift.blows.push({ hold: options?.hold === true, still: blow.still }) - 1,
    release: (slot: number, breeze: { still: boolean }) => drift.releases.push({ slot, still: breeze.still }),
    step: () => {
      drift.steps += 1;
    },
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
/** An identity camera: a point's clip position is its world position. */
const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const frameAt = (eye: [number, number, number]) =>
  ({ world: { camRight: [1, 0, 0] }, viewProjection: identity, eye, reducedMotion: false, hoveredFlowerId: null, lighting: { glow: 0, night: 0 } }) as never;
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
  drift.steps = 0;
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

    // The golden head is swapped in: its seeds now stay attached, held.
    layer.setFlowers([dandelion("d", false)]);
    await flush();
    fake.settle[1]!.resolve();
    await flush();
    layer.draw!({} as never, frameAt([0, 0.3, 30]));
    layer.update!({} as never, step);
    expect(drift.blows).toEqual([{ hold: true, still: false }]);
    expect(drift.releases).toHaveLength(0);

    // Walking closer lets them go, once.
    layer.draw!({} as never, frameAt([0, 0.3, 2]));
    layer.update!({} as never, step);
    layer.update!({} as never, step);
    expect(drift.releases).toEqual([{ slot: 0, still: false }]);
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
    layer.draw!({} as never, frameAt([5, 0.3, 2]));
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

  it("fades the puff in place under reduced motion", async () => {
    const layer = await golden([dandelion("d", false)]);
    layer.blowSeeds("d");
    layer.draw!({} as never, frameAt([0, 0.3, 2]));
    layer.update!({} as never, { dt: 0.016, reducedMotion: true } as never);
    expect(drift.releases).toEqual([{ slot: 0, still: true }]);
  });

  it("ignores a repeated request while one waits, and never blows a flower that is not a golden dandelion", async () => {
    const layer = await golden([dandelion("d", false), flower("r")]);
    layer.blowSeeds("d");
    layer.blowSeeds("d");
    layer.blowSeeds("r");
    layer.draw!({} as never, frameAt([0, 0.3, 2]));
    layer.update!({} as never, step);
    expect(drift.blows).toHaveLength(1);
    expect(drift.releases).toHaveLength(1);
  });
});

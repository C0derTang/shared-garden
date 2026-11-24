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
vi.mock("@/lib/world/flowers/generate", () => ({ packFlowers: () => ({}) }));
vi.mock("./flower-models", () => ({ placeWorldFlowers: (set: unknown) => set }));

const { createFlowerLayer } = await import("./flower-layer");

const flower = (id: string): WorldFlower => ({ id, spec: { type: "rose", seed: 1, growth: 1 }, position: [0, 0, 0] }) as WorldFlower;
const context = { gpu: {}, shadow: {}, sceneTarget: {} } as unknown as WorldLayerSetup;
const frame = { world: {}, reducedMotion: true, hoveredFlowerId: null, lighting: { glow: 0, night: 0 } } as never;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Which fake batch the layer draws now. */
function drawn(layer: ReturnType<typeof createFlowerLayer>) {
  for (const batch of fake.batches) batch.encode.mockClear();
  layer.draw!({} as never, frame);
  return fake.batches.find((batch) => batch.encode.mock.calls.length > 0)?.id;
}

beforeEach(() => {
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

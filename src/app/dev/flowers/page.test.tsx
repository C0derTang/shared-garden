import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/components/world/flowers/flower-gallery", () => ({ FlowerGallery: () => null }));

const { default: FlowerGalleryPage } = await import("./page");

describe("/dev/flowers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is not found in production builds", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(FlowerGalleryPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("reads the view, type, seed and light from the query in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const element = await FlowerGalleryPage({ searchParams: Promise.resolve({ view: "type", type: "bluebell", seed: "77", sky: "night", framing: "bloom" }) });
    expect(element.props).toMatchObject({ initialView: "type", initialType: "bluebell", initialSeed: 77, initialSky: "night", initialFraming: "bloom" });
    const fallback = await FlowerGalleryPage({ searchParams: Promise.resolve({ view: "nope", type: "weed", seed: "-3" }) });
    expect(fallback.props).toMatchObject({ initialView: "stages", initialType: "rose", initialSeed: 1, initialSky: "dusk" });
  });
});

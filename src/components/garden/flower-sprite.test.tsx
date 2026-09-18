import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  FlowerSprite,
  getFlowerStage,
  type HydrangeaMood,
} from "@/components/garden/flower-sprite";

describe("flower presentation", () => {
  it.each([
    [0, 5, "seed"],
    [1, 5, "sprout"],
    [2, 5, "sprout"],
    [3, 5, "bud"],
    [5, 5, "bud"],
    [3, 7, "sprout"],
    [4, 7, "bud"],
    [4, 10, "sprout"],
    [5, 10, "bud"],
    [0, 4, "seed"],
    [1, 4, "sprout"],
    [2, 4, "bud"],
    [3, 4, "bud"],
  ])(
    "maps %i of %i to %s without inventing a bloom",
    (growthUnits, growthTarget, stage) => {
      expect(
        getFlowerStage({ growthUnits, growthTarget, bloomed: false }),
      ).toBe(stage);
    },
  );

  it("honors permanent bloom even when a stale growth value is lower", () => {
    expect(
      getFlowerStage({ growthUnits: 0, growthTarget: 5, bloomed: true }),
    ).toBe("bloom");
  });

  it.each([
    [-1, 5],
    [1.5, 5],
    [Number.NaN, 5],
    [6, 5],
    [0, 0],
    [0, Infinity],
  ])(
    "rejects invalid authoritative progress %s / %s",
    (growthUnits, growthTarget) => {
      expect(() =>
        getFlowerStage({ growthUnits, growthTarget, bloomed: false }),
      ).toThrow(RangeError);
    },
  );

  it("is decorative by default inside a labeled button", () => {
    const { container } = render(
      <button aria-label="Open Rose">
        <FlowerSprite
          type="rose"
          growthUnits={2}
          growthTarget={5}
          bloomed={false}
        />
      </button>,
    );
    expect(screen.getByRole("button")).toHaveAccessibleName("Open Rose");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(container.querySelector("svg")).toHaveAttribute(
      "focusable",
      "false",
    );
  });

  it("labels a full-bloom preview honestly and leaves the input unchanged", () => {
    const progress = Object.freeze({
      growthUnits: 0,
      growthTarget: 5,
      bloomed: false,
    });
    const { rerender } = render(
      <FlowerSprite
        type="rose"
        {...progress}
        presentation="full-bloom"
        decorative={false}
      />,
    );
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Rose, bloom preview. Actual stage: seed.",
    );
    expect(screen.getByRole("img")).toHaveAttribute("data-stage", "bloom");
    rerender(<FlowerSprite type="rose" {...progress} decorative={false} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Rose, seed");
    expect(screen.getByRole("img")).toHaveAttribute("data-stage", "seed");
    expect(progress).toEqual({
      growthUnits: 0,
      growthTarget: 5,
      bloomed: false,
    });
  });

  it("retains a fulfilled Dandelion through the visual effect, but never fulfills an unbloomed one", () => {
    const { rerender } = render(
      <FlowerSprite
        type="dandelion"
        growthUnits={5}
        growthTarget={5}
        bloomed
        fulfilled
        presentation="full-bloom"
        decorative={false}
      />,
    );
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Dandelion, fulfilled wish",
    );
    expect(screen.getByRole("img")).toHaveAttribute("data-stage", "fulfilled");
    rerender(
      <FlowerSprite
        type="dandelion"
        growthUnits={0}
        growthTarget={5}
        bloomed={false}
        fulfilled
        decorative={false}
      />,
    );
    expect(screen.getByRole("img")).toHaveAccessibleName("Dandelion, seed");
  });

  it("keeps both Hydrangea tones and rejects raw fill or inherited-property values", () => {
    const { container, rerender } = render(
      <FlowerSprite
        type="hydrangea"
        growthUnits={7}
        growthTarget={7}
        bloomed
        moods={["calm", "tender"]}
      />,
    );
    const first = container.querySelector('[data-mood-tone="first"]');
    const second = container.querySelector('[data-mood-tone="second"]');
    expect(first?.getAttribute("fill")).toMatch(/^#[0-9a-f]{6}$/);
    expect(second?.getAttribute("fill")).toMatch(/^#[0-9a-f]{6}$/);
    expect(first?.getAttribute("fill")).not.toBe(second?.getAttribute("fill"));
    const calmTone = first?.getAttribute("fill");
    const tenderTone = second?.getAttribute("fill");
    rerender(
      <FlowerSprite
        type="hydrangea"
        growthUnits={7}
        growthTarget={7}
        bloomed
        moods={["tender", "calm"]}
      />,
    );
    expect(first).toHaveAttribute("fill", tenderTone);
    expect(second).toHaveAttribute("fill", calmTone);
    rerender(
      <FlowerSprite
        type="hydrangea"
        growthUnits={7}
        growthTarget={7}
        bloomed
        moods={["calm", "calm"]}
      />,
    );
    expect(first).toHaveAttribute("fill", calmTone);
    expect(second).toHaveAttribute("fill", calmTone);
    rerender(
      <FlowerSprite
        type="hydrangea"
        growthUnits={7}
        growthTarget={7}
        bloomed
        moods={[
          "url(https://example.invalid/image)" as HydrangeaMood,
          "__proto__" as HydrangeaMood,
        ]}
      />,
    );
    for (const node of container.querySelectorAll("[fill]")) {
      expect(node.getAttribute("fill")).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(container.innerHTML).not.toContain("url(");
  });
});

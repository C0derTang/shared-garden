import type { ReactNode } from "react";
import styles from "./flower-sprite.module.css";

const flowerNames = {
  rose: "Rose",
  cactus: "Cactus",
  tulip: "Tulip",
  marigold: "Marigold",
  daisy: "Daisy",
  hydrangea: "Hydrangea",
  sunflower: "Sunflower",
  snapdragon: "Snapdragon",
  moonflower: "Moonflower",
  bluebell: "Bluebell",
  dandelion: "Dandelion",
  "forget-me-not": "Forget-me-not",
  peony: "Peony",
} as const;

export type FlowerType = keyof typeof flowerNames;
export type FlowerStage = "seed" | "sprout" | "bud" | "bloom";
export type HydrangeaMood =
  "calm" | "joyful" | "tender" | "energized" | "low" | "tense";
export type FlowerProgress = Readonly<{
  growthUnits: number;
  growthTarget: number;
  bloomed: boolean;
}>;

type SpeciesProps =
  | {
      type: "hydrangea";
      moods?: readonly [HydrangeaMood, HydrangeaMood];
      fulfilled?: never;
    }
  | { type: "dandelion"; fulfilled?: boolean; moods?: never }
  | {
      type: Exclude<FlowerType, "hydrangea" | "dandelion">;
      moods?: never;
      fulfilled?: never;
    };

export type FlowerSpriteProps = FlowerProgress &
  SpeciesProps &
  Readonly<{
    presentation?: "actual" | "full-bloom";
    decorative?: boolean;
    size?: 32 | 64 | 96 | 128;
    className?: string;
  }>;

/** Display stages only. A growth number never grants permanent bloom credit. */
export function getFlowerStage({
  growthUnits,
  growthTarget,
  bloomed,
}: FlowerProgress): FlowerStage {
  if (
    !Number.isSafeInteger(growthTarget) ||
    growthTarget <= 0 ||
    !Number.isSafeInteger(growthUnits) ||
    growthUnits < 0 ||
    growthUnits > growthTarget
  ) {
    throw new RangeError(
      "Flower progress must contain valid growth units and target.",
    );
  }
  if (bloomed) return "bloom";
  if (growthUnits === 0) return "seed";
  return growthUnits * 2 < growthTarget ? "sprout" : "bud";
}

const green = "#4e6841";
const darkGreen = "#344a2d";
const lightGreen = "#88a361";
const cream = "#fff2ce";
const soil = "#a78c65";
const gold = "#e2b84f";

const petals: Record<FlowerType, readonly [string, string, string]> = {
  rose: ["#a64f57", "#d47a83", "#efb0a6"],
  cactus: [green, lightGreen, "#c5d18c"],
  tulip: ["#b96650", "#e39873", "#f4c394"],
  marigold: ["#b47531", "#de9b3f", "#f1c15b"],
  daisy: ["#c4b991", "#fff2ce", "#fffaf0"],
  hydrangea: ["#766788", "#a39ac2", "#d3b1c8"],
  sunflower: ["#ac7430", "#e2b84f", "#f4cf73"],
  snapdragon: ["#994f68", "#cb7592", "#edb0b1"],
  moonflower: ["#8a94a7", "#e1e4d5", "#fffaf0"],
  bluebell: ["#57638f", "#7c8dbb", "#b0bdd8"],
  dandelion: ["#9d9776", "#e7debb", "#fffaf0"],
  "forget-me-not": ["#557c94", "#83aebc", "#b5d2d3"],
  peony: ["#aa6176", "#d88da1", "#f0bac1"],
};

const moodColors: Record<HydrangeaMood, string> = {
  calm: "#6f9eab",
  joyful: "#e2b84f",
  tender: "#d88798",
  energized: "#d9854f",
  low: "#8b87ab",
  tense: "#b86b61",
};

function moodColor(mood: HydrangeaMood | undefined, fallback: string) {
  return mood !== undefined && Object.hasOwn(moodColors, mood)
    ? moodColors[mood]
    : fallback;
}

function Leaves({ type }: { type: FlowerType }) {
  if (type === "cactus") return null;
  if (type === "tulip")
    return (
      <>
        <path
          fill={darkGreen}
          d="M15 29V19h2v10zm-2-1h-2v-3H9v-6H7v-4h2v3h2v4h2zm5 0v-8h2v-4h2v-3h2v7h-2v5h-2v3z"
        />
        <path fill={lightGreen} d="M19 25v-5h2v-4h1v5h-1v4zM10 20h1v4h-1z" />
      </>
    );
  if (type === "dandelion")
    return (
      <>
        <path
          fill={green}
          d="M15 29V13h2v16zM14 28h-4v-2H6v-2h3v-2h3v3h3H14zm4 0v-4h3v-3h3v2h3v2h-4v2h-3v1z"
        />
        <path fill={lightGreen} d="M10 25h3v1h-3zm10 0h3v1h-3z" />
      </>
    );
  if (type === "moonflower")
    return (
      <>
        <path
          fill={darkGreen}
          d="M16 29V16h2v13zm-2-3H9v-2H7v-4h2v-2h4v2H9v4h5zm5-4v-3h3v-3h4v5h-3v2h-4z"
        />
        <path fill={lightGreen} d="M11 21h3v2h-3zm10-2h3v2h-3z" />
      </>
    );
  if (type === "forget-me-not" || type === "bluebell")
    return (
      <>
        <path
          fill={green}
          d="M15 29V13h2v16zM11 27v-5H9v-6h2v5h2v6zm7-2v-6h2v-4h2v5h-2v5zM12 29v-2H8v-3h3v2h3v3zm6 0v-3h3v-2h4v3h-4v2z"
        />
      </>
    );
  return (
    <>
      <path
        fill={darkGreen}
        d="M15 29V13h2v16zM14 25h-4v-2H7v-4h4v2h3zm4 1v-5h3v-2h5v4h-3v2h-3v1z"
      />
      <path
        fill={green}
        d="M15 28V16h1v12zM9 20h2v2h2v1h-3v-1H9zm11 2h3v-2h2v2h-2v2h-3z"
      />
      <path fill={lightGreen} d="M21 21h3v1h-3zM9 20h2v1H9z" />
    </>
  );
}

function Sprout({ type }: { type: FlowerType }) {
  if (type === "cactus")
    return (
      <>
        <path fill={darkGreen} d="M13 28V18h2v-2h4v2h2v10z" />
        <path fill={lightGreen} d="M14 27v-8h2v-2h2v10z" />
        <path fill={cream} d="M13 21h2v1h-2zm5 3h2v1h-2z" />
      </>
    );
  const narrow =
    type === "tulip" || type === "bluebell" || type === "snapdragon";
  return (
    <>
      <path fill={darkGreen} d="M15 29v-9h2v9z" />
      <path
        fill={green}
        d={
          narrow
            ? "M15 24h-3v-3h-2v-6h2v3h2v3h1zm2-2v-4h2v-4h3v6h-2v2z"
            : "M15 24h-4v-2H8v-4h5v2h2zm2-3v-4h3v-2h5v4h-3v2z"
        }
      />
      <path
        fill={lightGreen}
        d={
          narrow
            ? "M18 18h2v2h-2zM11 17h1v3h-1z"
            : "M10 19h3v1h-3zm10-3h3v2h-3z"
        }
      />
      <path fill={petals[type][1]} d="M15 18v-3h2v3z" />
    </>
  );
}

function Cactus({ bloom }: { bloom: boolean }) {
  return (
    <>
      <path
        fill={darkGreen}
        d={
          bloom
            ? "M12 29V18H8v-2H6V9h2V7h3v3H9v5h3V6h2V4h5v2h2v13h3v-7h3v9h-2v2h-4v6z"
            : "M12 29V21H9v-2H7v-7h3v6h3V9h2V7h4v2h2v20z"
        }
      />
      <path
        fill={green}
        d={
          bloom
            ? "M14 28V7h2V5h3v23zM8 10h1v5H8zm17 4h1v7h-4v-1h3z"
            : "M14 28V10h2V8h3v20zM8 14h1v4h3v1H8z"
        }
      />
      <path
        fill={lightGreen}
        d={bloom ? "M15 8h1v19h-1zM17 5h2v2h-2z" : "M15 11h1v16h-1z"}
      />
      <path
        fill={cream}
        d="M12 14h2v1h-2zm6-3h2v1h-2zm-3 9h2v1h-2zm3 5h2v1h-2z"
      />
      {bloom && (
        <>
          <path fill={petals.rose[0]} d="M17 7V3h2V1h3v2h2v4h-2v2h-3V7z" />
          <path fill={petals.rose[2]} d="M19 3h3v3h-3z" />
          <path fill={gold} d="M20 4h1v1h-1z" />
        </>
      )}
    </>
  );
}

function Bud({ type, opening }: { type: FlowerType; opening: boolean }) {
  const [shadow, color, highlight] = petals[type];
  if (type === "cactus") return <Cactus bloom={false} />;
  const heads: Record<Exclude<FlowerType, "cactus">, ReactNode> = {
    rose: (
      <>
        <path fill={shadow} d="M12 15V9h2V7h5v2h2v6h-2v3h-5v-3z" />
        <path fill={color} d="M14 9h3v5h-3zm3 2h2v5h-2z" />
      </>
    ),
    tulip: (
      <>
        <path fill={shadow} d="M12 14V8h2V5h2v2h2V5h2v3h1v7h-2v3h-5v-4z" />
        <path fill={color} d="M14 8h2v7h-2zm3 2h2v6h-2z" />
      </>
    ),
    marigold: (
      <>
        <path fill={shadow} d="M11 15V9h2V7h6v2h3v6h-3v3h-5v-3z" />
        <path fill={color} d="M13 10h7v4h-7z" />
        <path fill={highlight} d="M14 8h4v2h-4z" />
      </>
    ),
    daisy: (
      <>
        <path fill={shadow} d="M13 16V9h2V7h4v2h2v7h-2v2h-4v-2z" />
        <path fill={color} d="M15 9h4v6h-4z" />
      </>
    ),
    hydrangea: (
      <>
        <path fill={shadow} d="M8 13V9h3V7h4v3h3V7h4v3h3v5h-4v3H11v-3H8z" />
        <path fill={color} d="M9 10h4v3H9zm6 2h4v4h-4zm5-3h3v4h-3z" />
      </>
    ),
    sunflower: (
      <>
        <path fill={green} d="M10 14V7h3V5h7v2h3v7h-3v3h-7v-3z" />
        <path fill={shadow} d="M13 8h7v7h-7z" />
        <path fill={color} d="M14 6h5v3h-5zm-2 4h3v3h-3z" />
      </>
    ),
    snapdragon: (
      <>
        <path fill={green} d="M15 18V5h2V3h2v15zm-3-2V9h2v7zm7 0V8h3v6h-1v2z" />
        <path fill={color} d="M12 12h3v4h-3zm5-5h3v3h-3zm2 7h3v3h-3z" />
      </>
    ),
    moonflower: (
      <>
        <path fill={shadow} d="M13 16V9h2V5h3v2h2v7h-2v4h-3v-2z" />
        <path fill={highlight} d="M16 7h2v6h-2zm-1 6h2v3h-2z" />
      </>
    ),
    bluebell: (
      <>
        <path
          fill={green}
          d="M16 15V8h3V6h4v2h2v7h-2V9h-4v6zM9 17v-5h4v2h-2v3z"
        />
        <path fill={shadow} d="M7 15h5v5H7zm14-2h5v6h-5z" />
        <path fill={color} d="M8 15h2v3H8zm14-2h2v4h-2z" />
      </>
    ),
    dandelion: (
      <>
        <path fill={green} d="M12 16V9h2V7h5v2h2v7h-2v2h-5v-2z" />
        <path fill={gold} d="M14 8h5v5h-5z" />
        <path fill={cream} d="M14 8h3v2h-3z" />
      </>
    ),
    "forget-me-not": (
      <>
        <path fill={shadow} d="M8 12h5v5H8zm7-6h5v6h-5zm6 7h5v5h-5z" />
        <path fill={color} d="M9 12h3v3H9zm7-6h3v3h-3zm6 7h3v3h-3z" />
      </>
    ),
    peony: opening ? (
      <>
        <path fill={shadow} d="M9 15V9h3V6h8v2h3v3h2v5h-3v3H12v-2H9z" />
        <path fill={color} d="M11 10h3V8h5v3h3v4h-3v2h-6v-2h-2z" />
        <path fill={highlight} d="M12 9h3v4h-3zm5 0h3v3h-3zm-2 5h3v2h-3z" />
      </>
    ) : (
      <>
        <path fill={shadow} d="M11 15V9h2V7h7v2h2v6h-2v3h-7v-3z" />
        <path fill={color} d="M13 9h3v6h-3zm4 0h3v7h-3z" />
        <path fill={highlight} d="M14 8h5v2h-5z" />
      </>
    ),
  };
  return (
    <>
      <Leaves type={type} />
      {heads[type]}
    </>
  );
}

function Floret({ x, y }: { x: number; y: number }) {
  return <path d={`M${x + 2} ${y}h3v2h2v3h-2v2h-3v-2h-2v-3h2z`} />;
}

function Bloom({
  type,
  moods,
}: {
  type: FlowerType;
  moods?: readonly [HydrangeaMood, HydrangeaMood];
}) {
  const [shadow, color, highlight] = petals[type];
  if (type === "cactus") return <Cactus bloom />;
  if (type === "hydrangea")
    return (
      <>
        <Leaves type={type} />
        <path fill={shadow} d="M7 17V8h3V5h5V3h5v3h4v3h3v8h-3v3H11v-3z" />
        <g fill={moodColor(moods?.[0], color)} data-mood-tone="first">
          <Floret x={6} y={9} />
          <Floret x={12} y={4} />
          <Floret x={18} y={11} />
        </g>
        <g fill={moodColor(moods?.[1], highlight)} data-mood-tone="second">
          <Floret x={18} y={6} />
          <Floret x={11} y={12} />
        </g>
        <path
          fill={cream}
          d="M9 12h1v1H9zm6-5h1v1h-1zm6 2h1v1h-1zm0 5h1v1h-1zm-7 1h1v1h-1z"
        />
      </>
    );
  const heads: Record<
    Exclude<FlowerType, "cactus" | "hydrangea">,
    ReactNode
  > = {
    rose: (
      <>
        <path fill={shadow} d="M8 14V8h3V5h9v2h4v8h-3v4H12v-2H8z" />
        <path fill={color} d="M10 9h3V7h7v3h2v5h-4v2h-5v-3h-3z" />
        <path
          fill={highlight}
          d="M12 8h7v2h-5v4h-2zm4 4h4v2h-4zm-2 4h5v1h-5z"
        />
        <path fill={shadow} d="M15 10h4v2h-4z" />
      </>
    ),
    tulip: (
      <>
        <path
          fill={shadow}
          d="M7 12V5h3v3h3V4h5v4h3V5h3v8h-2v4h-3v3h-7v-3H9v-5z"
        />
        <path
          fill={color}
          d="M9 8h3v3h3V6h2v5h4V8h1v5h-2v3h-3v2h-4v-3h-2v-3H9z"
        />
        <path fill={highlight} d="M14 7h2v8h-2zm5 5h2v2h-2z" />
      </>
    ),
    marigold: (
      <>
        <path
          fill={shadow}
          d="M7 14V9h3V6h4V4h5v2h4v3h3v6h-3v3h-4v2h-6v-2H9v-4z"
        />
        <path fill={color} d="M9 10h3V7h4V6h3v3h4v5h-3v3h-6v-2h-4H9z" />
        <path fill={highlight} d="M11 10h4V8h3v3h3v3h-4v3h-3v-4h-3z" />
        <path fill={shadow} d="M15 11h3v3h-3z" />
        <path fill={color} d="M23 20h4v3h-4z" />
      </>
    ),
    daisy: (
      <>
        <path
          fill={shadow}
          d="M13 3h6v5h4V6h3v6h-4v3h4v5h-6v-3h-2v6h-5v-5H9v3H5v-6h5v-3H5V7h5v3h3z"
        />
        <path
          fill={highlight}
          d="M14 4h4v5h-4zm8 3h3v4h-3zm-1 9h4v3h-4zm-7 1h3v5h-3zm-8-1h3v4H6zm0-8h3v3H6z"
        />
        <path fill={gold} d="M12 10h8v7h-8z" />
        <path fill={cream} d="M13 10h4v2h-4z" />
        <path fill="#ac7430" d="M17 14h3v3h-3z" />
      </>
    ),
    sunflower: (
      <>
        <path
          fill={shadow}
          d="M12 2h8v4h5v4h4v7h-4v4h-5v3h-8v-3H7v-4H4v-7h3V6h5z"
        />
        <path
          fill={color}
          d="M13 2h6v5h5v4h4v5h-5v4h-4v3h-6v-5H8v-3H5v-4h5V7h3z"
        />
        <path
          fill={highlight}
          d="M14 3h3v4h-3zm-6 5h4v3H8zm14 3h4v2h-4zm-9 16h2v1h-2z"
        />
        <path fill="#71523d" d="M11 8h10v3h3v7h-4v3h-8v-3H9v-7h2z" />
        <path fill="#9a713e" d="M12 10h8v8h-8z" />
        <path fill={gold} d="M13 11h2v2h-2zm4 3h2v2h-2zm-4 3h1v1h-1z" />
      </>
    ),
    snapdragon: (
      <>
        <path fill={green} d="M15 22V3h2v19z" />
        <path
          fill={shadow}
          d="M14 2h5v4h3v5h-5v3h6v6h-6v3h-6v-5H8v-6h6V9h-3V5h3z"
        />
        <path
          fill={color}
          d="M15 2h3v3h-3zm2 5h4v3h-4zm-5-1h3v3h-3zm-3 7h5v4H9zm8 2h5v4h-5zm-5 4h4v3h-4z"
        />
        <path fill={highlight} d="M17 7h4v1h-4zm-8 6h4v2H9zm8 2h4v2h-4z" />
      </>
    ),
    moonflower: (
      <>
        <path
          fill={shadow}
          d="M14 3h5v5h4V6h4v6h-5v5h3v4h-6v-4h-4v4H9v-5H5v-5h5V7h4z"
        />
        <path
          fill={highlight}
          d="M15 4h3v6h5V8h3v3h-6v5h3v3h-3v-4h-6v4h-3v-5H7v-2h5V8h3z"
        />
        <path fill={color} d="M14 10h5v6h-5z" />
        <path fill={gold} d="M16 11h2v3h-2z" />
      </>
    ),
    bluebell: (
      <>
        <path
          fill={green}
          d="M16 16V6h2V4h5v2h2v9h-2V7h-2V6h-3v10zM9 19V9h2V7h4v2h-4v10z"
        />
        <path
          fill={shadow}
          d="M6 14h7v5h2v3H4v-3h2zm15-2h6v6h2v3H19v-3h2zm-8-7h6v6h2v3H11v-3h2z"
        />
        <path fill={color} d="M7 15h4v5H7zm15-2h3v6h-3zm-8-7h3v6h-3z" />
        <path fill={highlight} d="M7 15h2v4H7zm15-2h1v5h-1zm-8-7h1v5h-1z" />
      </>
    ),
    dandelion: (
      <>
        <path
          fill={shadow}
          d="M12 5h8v2h3v3h2v6h-3v3h-4v2h-5v-3H9v-3H7v-5h3V7h2z"
        />
        <path
          fill={highlight}
          d="M13 3h2v5h-2zm4 0h2v5h-2zm5 3h2v2h-2v3h-2V7h2zM8 6h2v4H8zm-3 6h5v2H5zm18 0h4v2h-4zM8 16h3v3H8zm4 3h2v4h-2zm6 0h2v4h-2zm4-3h3v3h-3zM11 9h9v9h-9z"
        />
        <path fill={color} d="M13 10h6v7h-6z" />
        <path fill={soil} d="M15 12h2v3h-2z" />
      </>
    ),
    "forget-me-not": (
      <>
        <g fill={shadow}>
          <Floret x={5} y={11} />
          <Floret x={12} y={3} />
          <Floret x={20} y={12} />
        </g>
        <g fill={color}>
          <Floret x={6} y={10} />
          <Floret x={13} y={2} />
          <Floret x={20} y={11} />
        </g>
        <path fill={highlight} d="M8 10h2v2H8zm7-8h2v2h-2zm7 9h2v2h-2z" />
        <path fill={gold} d="M9 13h2v2H9zm7-8h2v2h-2zm7 9h2v2h-2z" />
      </>
    ),
    peony: (
      <>
        <path
          fill={shadow}
          d="M5 13V8h4V5h5V3h6v3h5v3h3v7h-3v4h-5v2h-9v-3H7v-6z"
        />
        <path fill={color} d="M7 9h4V6h4V5h4v3h5v3h2v5h-4v3h-9v-2H9v-4H7z" />
        <path
          fill={highlight}
          d="M10 8h3v5h-3zm5-2h3v5h-3zm5 3h3v4h-3zM9 14h4v3H9zm6 1h5v4h-5zm7-1h3v3h-3z"
        />
        <path fill={shadow} d="M14 11h5v3h-5z" />
        <path fill={cream} d="M15 11h2v2h-2z" />
      </>
    ),
  };
  return (
    <>
      <Leaves type={type} />
      {heads[type]}
    </>
  );
}

function FulfilledDandelion() {
  return (
    <>
      <Leaves type="dandelion" />
      <path fill={soil} d="M14 11h4v4h-4z" />
      <path
        fill={petals.dandelion[0]}
        d="M12 9h2v3h-2zm6 0h2v3h-2zm-2-2h1v4h-1z"
      />
      <path
        fill={petals.dandelion[0]}
        d="M4 7h5v1H4zm3-3h1v5H7zm15 0h5v1h-5zm3-3h1v5h-1zm1 12h5v1h-5zm3-3h1v5h-1z"
      />
      <path
        fill={petals.dandelion[2]}
        d="M4 6h5v1H4zm2-2h1v5H6zm16-1h5v1h-5zm2-2h1v5h-1zm2 11h5v1h-5zm2-2h1v5h-1z"
      />
      <path fill={soil} d="M6 9h1v2H6zm18-3h1v2h-1zm4 9h1v2h-1z" />
    </>
  );
}

/** Original local artwork. Supply validated server facts; no time or growth is computed here. */
export function FlowerSprite(props: FlowerSpriteProps) {
  const {
    type,
    presentation = "actual",
    decorative = true,
    size = 64,
    className,
  } = props;
  const actualStage = getFlowerStage(props);
  const fulfilled = type === "dandelion" && props.fulfilled && props.bloomed;
  const stage = fulfilled
    ? "fulfilled"
    : presentation === "full-bloom"
      ? "bloom"
      : actualStage;
  const preview =
    presentation === "full-bloom" && actualStage !== "bloom" && !fulfilled;
  const label = `${flowerNames[type]}, ${
    fulfilled
      ? "fulfilled wish"
      : preview
        ? `bloom preview. Actual stage: ${actualStage}.`
        : stage
  }`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={[styles.sprite, className].filter(Boolean).join(" ")}
      shapeRendering="crispEdges"
      focusable="false"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      data-stage={stage}
    >
      <path fill="#d5c6a6" d="M10 29h13v2H10z" />
      {stage === "seed" && (
        <>
          <path fill={soil} d="M13 28v-3h2v-2h4v2h2v3h-2v2h-4v-2z" />
          <path fill={petals[type][1]} d="M15 24h3v3h-3z" />
          <path fill={cream} d="M15 24h1v1h-1z" />
        </>
      )}
      {stage === "sprout" && <Sprout type={type} />}
      {stage === "bud" && (
        <Bud
          type={type}
          opening={props.growthUnits === props.growthTarget - 1}
        />
      )}
      {stage === "bloom" && <Bloom type={type} moods={props.moods} />}
      {stage === "fulfilled" && <FulfilledDandelion />}
    </svg>
  );
}

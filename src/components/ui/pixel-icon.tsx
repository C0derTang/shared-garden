type IconName = "sprout" | "heart" | "book" | "flower" | "settings" | "arrow";

const paths: Record<IconName, string> = {
  sprout: "M11 21V11H8V8H4V4h5v3h3v5h1V8h3V5h5v5h-4v3h-4v8z",
  heart:
    "M4 3h5v2h2v2h2V5h2V3h5v2h2v8h-2v2h-2v2h-2v2h-2v2h-4v-2H8v-2H6v-2H4v-2H2V5h2z",
  book: "M3 3h7v2h4V3h7v18h-7v-2h-4v2H3zm2 2v14h3v-2h3V7H8V5zm11 0v2h-3v10h3v2h3V5z",
  flower: "M9 2h6v5h5v6h-5v3h-2v5h-2v-5H9v-3H4V7h5zm1 6v4h4V8z",
  settings: "M9 2h6v3h3v3h3v7h-3v3h-3v3H9v-3H6v-3H3V8h3V5h3zm0 7v6h6V9z",
  arrow: "M13 4h3v3h3v3h3v4h-3v3h-3v3h-3v-6H2v-4h11z",
};

export function PixelIcon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`pixel-icon ${className}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <path d={paths[name]} fillRule="evenodd" />
    </svg>
  );
}

/**
 * Routes of the legacy garden (decision 0067). The whole garden lives at
 * `/legacy`; Memories, Achievements, Settings and Songs are in-page panels
 * selected by the `panel` query, so each one stays deep-linkable.
 */
export const legacyPath = "/legacy";

export const legacyPanels = {
  memories: "Memories",
  achievements: "Achievements",
  settings: "Settings",
  songs: "Our songs",
} as const;
export type LegacyPanel = keyof typeof legacyPanels;

/** The panel a query value names, or null for anything unrecognized. */
export function legacyPanel(value: unknown): LegacyPanel | null {
  return typeof value === "string" && Object.hasOwn(legacyPanels, value)
    ? (value as LegacyPanel)
    : null;
}

export const legacyPanelHref = (panel: LegacyPanel) =>
  `${legacyPath}?panel=${panel}`;

/** The panel an in-app link opens, or null when it does not open one. */
export function legacyPanelFromHref(href: string): LegacyPanel | null {
  const url = new URL(href, "http://legacy.invalid");
  return url.pathname === legacyPath
    ? legacyPanel(url.searchParams.get("panel"))
    : null;
}

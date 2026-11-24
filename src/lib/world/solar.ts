/**
 * Solar position for the garden sky. The garden follows real
 * America/Los_Angeles solar time, so the sun is computed for a generic
 * reference point at the city the time zone is named after (not any
 * member's location).
 */

export const SKY_REFERENCE = { latitude: 34.05, longitude: -118.24 } as const;

export type SkyPhase = "night" | "dawn" | "day" | "dusk";

export interface SolarPosition {
  /** Degrees above the horizon (negative below). */
  readonly elevation: number;
  /** Degrees clockwise from true north. */
  readonly azimuth: number;
}

export interface SkyState extends SolarPosition {
  readonly phase: SkyPhase;
  /** True between solar midnight and solar noon. */
  readonly morning: boolean;
}

/** Below this elevation the sky is fully night (nautical-ish twilight end). */
export const NIGHT_ELEVATION = -6;
/** Above this elevation the sky is fully day. */
export const DAY_ELEVATION = 8;

const RAD = Math.PI / 180;

function wrapDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

/**
 * Approximate solar elevation/azimuth (NOAA low-precision algorithm, well
 * under a degree of error) for an instant and location.
 */
export function solarPosition(
  date: Date,
  latitude: number = SKY_REFERENCE.latitude,
  longitude: number = SKY_REFERENCE.longitude,
): SolarPosition {
  const julianDay = date.getTime() / 86_400_000 + 2_440_587.5;
  const n = julianDay - 2_451_545.0;
  const meanLongitude = wrapDegrees(280.46 + 0.9856474 * n);
  const meanAnomaly = wrapDegrees(357.528 + 0.9856003 * n) * RAD;
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * n) * RAD;

  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));

  const gmstHours = wrapDegrees((18.697374558 + 24.06570982441908 * n) * 15) / 15;
  const localSiderealDegrees = gmstHours * 15 + longitude;
  const hourAngle = wrapDegrees(localSiderealDegrees - rightAscension / RAD + 180) - 180;
  const h = hourAngle * RAD;
  const lat = latitude * RAD;

  const elevation = Math.asin(
    Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(h),
  );
  const azimuth = Math.atan2(
    -Math.sin(h),
    Math.tan(declination) * Math.cos(lat) - Math.sin(lat) * Math.cos(h),
  );
  return { elevation: elevation / RAD, azimuth: wrapDegrees(azimuth / RAD) };
}

/** Maps an instant to the garden's sky phase at the reference point. */
export function skyStateAt(date: Date): SkyState {
  const position = solarPosition(date);
  // East of the meridian (azimuth < 180) the sun is climbing.
  const morning = position.azimuth < 180;
  let phase: SkyPhase;
  if (position.elevation < NIGHT_ELEVATION) phase = "night";
  else if (position.elevation >= DAY_ELEVATION) phase = "day";
  else phase = morning ? "dawn" : "dusk";
  return { ...position, phase, morning };
}

/**
 * World-space direction toward the sun. The garden camera looks west (-z)
 * across the lake toward the sunset: north is to the right (+x), south to the
 * left (-x) and east behind the viewer (+z).
 */
export function sunDirection(position: SolarPosition): [number, number, number] {
  const elevation = position.elevation * RAD;
  const azimuth = position.azimuth * RAD;
  const horizontal = Math.cos(elevation);
  return [Math.cos(azimuth) * horizontal, Math.sin(elevation), Math.sin(azimuth) * horizontal];
}

/**
 * A small, dependency-free NOAA-style solar position model for the garden light
 * (decision 0050). It is accurate to about a minute for sunrise and sunset at
 * mid latitudes, which is far more than a sky colour needs.
 */

/** The garden's fixed Pacific reference point: Los Angeles. */
export const pacificSky = { latitude: 34.05, longitude: -118.24 };

const minute = 60_000;
const day = 86_400_000;
const rad = Math.PI / 180;
const deg = 180 / Math.PI;
/** Sunrise and sunset: the upper limb on the horizon, with refraction. */
export const horizon = -0.833;
/** Civil dawn and dusk. */
export const civilTwilight = -6;

// Declination (degrees) and equation of time (minutes) for an instant.
function orbit(ms: number) {
  const t = (ms / day + 2440587.5 - 2451545) / 36525;
  const l0 = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * rad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * rad) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const epsilon0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const epsilon = epsilon0 + 0.00256 * Math.cos(omega * rad);
  const declination = Math.asin(Math.sin(epsilon * rad) * Math.sin(lambda * rad)) * deg;
  const y = Math.tan((epsilon / 2) * rad) ** 2;
  const equation =
    4 *
    deg *
    (y * Math.sin(2 * l0 * rad) -
      2 * e * Math.sin(m * rad) +
      4 * e * y * Math.sin(m * rad) * Math.cos(2 * l0 * rad) -
      0.5 * y * y * Math.sin(4 * l0 * rad) -
      1.25 * e * e * Math.sin(2 * m * rad));
  return { declination, equation };
}

/** The sun's geometric elevation and azimuth (degrees, azimuth clockwise from north). */
export function sunPosition(ms: number, { latitude, longitude } = pacificSky) {
  const { declination, equation } = orbit(ms);
  const utcMinutes = (((ms % day) + day) % day) / minute;
  const solarTime = (((utcMinutes + equation + 4 * longitude) % 1440) + 1440) % 1440;
  const hourAngle = solarTime / 4 - 180;
  const lat = latitude * rad;
  const dec = declination * rad;
  const cosZenith = Math.min(1, Math.max(-1,
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle * rad)));
  const zenith = Math.acos(cosZenith);
  const elevation = 90 - zenith * deg;
  const cosAzimuth = Math.min(1, Math.max(-1,
    (Math.sin(lat) * cosZenith - Math.sin(dec)) / (Math.cos(lat) * Math.sin(zenith))));
  const fromSouth = Math.acos(cosAzimuth) * deg;
  const azimuth = hourAngle > 0 ? (fromSouth + 180) % 360 : (540 - fromSouth) % 360;
  return { elevation, azimuth };
}

/** The UTC midnight of the local mean solar day that contains an instant. */
export function solarDay(ms: number, { longitude } = pacificSky) {
  return Math.floor((ms + longitude * 4 * minute) / day) * day;
}

// The instant the sun crosses `altitude` on the solar day that starts at the UTC
// midnight `base`: rising (-1) or setting (+1). Two refinements give well
// under a minute of error.
function crossing(base: number, altitude: number, direction: -1 | 1, { latitude, longitude } = pacificSky) {
  let at = base + (720 - 4 * longitude) * minute;
  for (let pass = 0; pass < 3; pass++) {
    const { declination, equation } = orbit(at);
    const lat = latitude * rad;
    const dec = declination * rad;
    const cosHour = (Math.sin(altitude * rad) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
    const hour = Math.acos(Math.min(1, Math.max(-1, cosHour))) * deg;
    at = base + (720 - 4 * (longitude - direction * hour) - equation) * minute;
  }
  return at;
}

/** Solar noon, sunrise, sunset and civil twilight for the solar day at `base`. */
export function sunTimes(base: number, place = pacificSky) {
  const { equation } = orbit(base + (720 - 4 * place.longitude) * minute);
  return {
    civilDawn: crossing(base, civilTwilight, -1, place),
    sunrise: crossing(base, horizon, -1, place),
    noon: base + (720 - 4 * place.longitude - equation) * minute,
    sunset: crossing(base, horizon, 1, place),
    civilDusk: crossing(base, civilTwilight, 1, place),
  };
}

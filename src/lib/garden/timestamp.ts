/** Order ISO timestamps without discarding PostgreSQL fractional precision. */
export function compareTimestamps(left: string, right: string): number {
  const parts = (value: string) => {
    const match = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
    if (!match) return { second: Date.parse(value), fraction: "" };
    return { second: Date.parse(`${match[1]}${match[3]}`), fraction: match[2] ?? "" };
  };
  const a = parts(left);
  const b = parts(right);
  if (a.second !== b.second) return a.second - b.second;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const af = a.fraction.padEnd(width, "0");
  const bf = b.fraction.padEnd(width, "0");
  return af === bf ? 0 : af > bf ? 1 : -1;
}

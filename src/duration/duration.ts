const timeUnits = {
  ms: 1,
  s: 1000,
  m: 1000 * 60,
  h: 1000 * 60 * 60,
  d: 1000 * 60 * 60 * 24,
  w: 1000 * 60 * 60 * 24 * 7,
  M: 1000 * 60 * 60 * 24 * 30,
  y: 1000 * 60 * 60 * 24 * 365,
};
type TimeUnit = keyof typeof timeUnits;
export type TimeDurationStr = `${number}${TimeUnit}` | `0`;

/**
 *
 * @param str 1.5s, -2m, 1h, 1d, 1w, 1M, 1.5y
 * @returns duration in milliseconds
 */
export const parseTimeDuration = (str: TimeDurationStr | undefined): number => {
  if (!str) return 0;
  if (str === "0") return 0;
  if (!str.match) return 0;
  const match = str.match(
    /^(?<sign>[+-])?(?<number>\d*(\.\d)?)(?<unit>(ms|s|m|h|d|w|M|y))$/
  );
  if (!match || !match.groups)
    throw new Error(`Cannot parse "${str}" as a duration`);
  const g = match.groups;
  const sign = g.sign === "-" ? -1 : 1;
  const number = parseFloat(g.number);
  if (Number.isNaN(number))
    throw new Error(`Cannot parse "${str}" as a duration`);
  const unit = timeUnits[g.unit as TimeUnit];
  if (unit === undefined)
    throw new Error(`Cannot parse "${str}" as a duration`);

  return sign * number * unit;
};

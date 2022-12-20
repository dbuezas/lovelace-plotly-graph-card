import { parseTimeDuration } from "./duration";

describe("data-ranges", () => {
  const ms = 1;
  const s = ms * 1000;
  const m = s * 60;
  const h = m * 60;
  const d = h * 24;
  const w = d * 7;
  const M = d * 30;
  const y = d * 365;
  it("Should parse all units", () => {
    expect(parseTimeDuration("1ms")).toBe(1 * ms);
    expect(parseTimeDuration("1s")).toBe(1 * s);
    expect(parseTimeDuration("1m")).toBe(1 * m);
    expect(parseTimeDuration("1h")).toBe(1 * h);
    expect(parseTimeDuration("1d")).toBe(1 * d);
    expect(parseTimeDuration("1w")).toBe(1 * w);
    expect(parseTimeDuration("1M")).toBe(1 * M);
    expect(parseTimeDuration("1y")).toBe(1 * y);
  });
  it("Should parse all signs", () => {
    expect(parseTimeDuration("1ms")).toBe(1 * ms);
    expect(parseTimeDuration("+1ms")).toBe(1 * ms);
    expect(parseTimeDuration("-1ms")).toBe(-1 * ms);
  });
  it("Should parse all numbers", () => {
    expect(parseTimeDuration("1s")).toBe(1 * s);
    expect(parseTimeDuration("1.5s")).toBe(1.5 * s);
  });
  it("Should parse undefined", () => {
    expect(() => parseTimeDuration(undefined)).toThrow();
  });
  it("Should throw when it can't parse", () => {
    // @ts-expect-error
    expect(() => parseTimeDuration("1")).toThrow();
    // @ts-expect-error
    expect(() => parseTimeDuration("s")).toThrow();
    // @ts-expect-error
    expect(() => parseTimeDuration("--1s")).toThrow();
    // @ts-expect-error
    expect(() => parseTimeDuration("-1.1.1s")).toThrow();
  });
});

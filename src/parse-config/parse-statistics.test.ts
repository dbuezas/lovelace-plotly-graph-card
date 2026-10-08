import { parseTimeDuration } from "../duration/duration";
import { parseStatistics } from "./parse-statistics";

describe("yearly statistics periods", () => {
  it("accepts an explicit year period without changing the statistic", () => {
    expect(parseStatistics([0, 1], "max", "year")).toEqual({
      statistic: "max",
      period: "year",
    });
  });

  it("selects year at a custom automatic-period threshold", () => {
    const threshold = parseTimeDuration("12M");
    const period = { "0m": "5minute", "25h": "hour", "12M": "year" } as const;
    expect(parseStatistics([0, threshold - 1], "mean", period)?.period).toBe(
      "hour",
    );
    expect(parseStatistics([0, threshold], "mean", period)?.period).toBe(
      "year",
    );
  });

  it("selects year for at least 100 years in the built-in auto mapping", () => {
    const threshold = parseTimeDuration("100y");
    expect(parseStatistics([0, threshold - 1], "mean", "auto")?.period).toBe(
      "month",
    );
    expect(parseStatistics([0, threshold], "mean", "auto")?.period).toBe(
      "year",
    );
  });
});

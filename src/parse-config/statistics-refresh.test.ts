import type { HomeAssistant } from "custom-card-helpers";
import type { EntityConfig, InputConfig } from "../types";
import { ConfigParser } from "./parse-config";
import { readThemeColors } from "./themed-layout";

const hour = 3600000;
const start = Date.parse("2026-10-03T00:00:00Z");
const css_vars = {
  ...readThemeColors({ getPropertyValue: () => "" }),
  "font-family": "sans-serif",
  "font-size": "12px",
  "font-weight": "400",
};
const values = (entity: EntityConfig) => ("y" in entity ? entity.y : undefined);
const callWS = vi.fn(async (request) =>
  Object.fromEntries(
    (request.statistic_ids || request.entity_ids).map((id: string) => [
      id,
      request.type === "recorder/statistics_during_period"
        ? [{ start, end: start + 24 * hour, mean: 2 }]
        : [{ s: "5", lu: (Date.now() - 60000) / 1000 }],
    ]),
  ),
);
const hass = {
  callWS,
  states: {},
  locale: { language: "en" },
} as unknown as HomeAssistant;

describe("parsing after Home Assistant publishes statistics", () => {
  beforeAll(() => {
    Object.assign(globalThis, { window: {} });
  });
  beforeEach(() => {
    callWS.mockClear();
    vi.spyOn(Date, "now").mockReturnValue(start + 12 * hour);
  });
  afterEach(() => vi.restoreAllMocks());

  it("fetches only the published resolution, batched, and no history", async () => {
    const parser = new ConfigParser();
    const yaml: InputConfig = {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities: [
        { entity: "sensor.short", statistic: "mean", period: "5minute" },
        { entity: "sensor.day_a", statistic: "mean", period: "day" },
        { entity: "sensor.day_b", statistic: "mean", period: "day" },
        { entity: "sensor.history", extend_to_present: false },
      ],
    };
    const initial = await parser.update({ yaml, hass, css_vars });
    const published = async (
      period: "5minute" | "hour",
      fetch_mask?: boolean[],
    ) => {
      callWS.mockClear();
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + hour);
      await parser.cache.refreshStatistics(Date.now(), period);
      const result = await parser.update({
        yaml: { ...yaml, fetch_mask } as InputConfig,
        hass,
        css_vars,
        statisticsUpdates: new Set([period]),
      });
      expect(result.errors).toEqual([]);
      expect(values(result.parsed.entities[3])).toEqual(
        values(initial.parsed.entities[3]),
      );
      return callWS.mock.calls.map(([{ type, period, statistic_ids }]) => ({
        type,
        period,
        statistic_ids,
      }));
    };
    const statistics = "recorder/statistics_during_period";
    expect(await published("5minute")).toEqual([
      { type: statistics, period: "5minute", statistic_ids: ["sensor.short"] },
    ]);
    expect(await published("hour")).toEqual([
      {
        type: statistics,
        period: "day",
        statistic_ids: ["sensor.day_a", "sensor.day_b"],
      },
    ]);
    // Hidden traces stay hidden.
    expect(await published("5minute", [false, true, true, true])).toEqual([]);
  });

  it("lists the periods of live statistics, including internal ones", async () => {
    const parser = new ConfigParser();
    const yaml: InputConfig = {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities: [
        {
          entity: "sensor.a",
          statistic: "mean",
          period: "day",
          internal: true,
        },
        { entity: "sensor.b", statistic: "mean", period: "5minute" },
      ],
    };
    await parser.update({ yaml, hass, css_vars });
    expect([...parser.statisticsPeriods]).toEqual(["day", "5minute"]);
    await parser.update({
      yaml: {
        ...yaml,
        visible_range: [start - 2 * 86400000, start - 86400000],
      } as InputConfig,
      hass,
      css_vars,
    });
    expect([...parser.statisticsPeriods]).toEqual([]);
  });
});

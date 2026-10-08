import type { HomeAssistant } from "custom-card-helpers";
import type { EntityConfig, InputConfig } from "../types";
import { ConfigParser } from "./parse-config";
import { readThemeColors } from "./themed-layout";

const hour = 3600000;
const start = Date.parse("2026-10-03T00:00:00Z");
const cssVars = {
  ...readThemeColors({ getPropertyValue: () => "" }),
  "font-family": "sans-serif",
  "font-size": "12px",
  "font-weight": "400",
};
const values = (entity: EntityConfig) => ("y" in entity ? entity.y : undefined);

describe("refreshing statistics published after the initial fetch", () => {
  beforeAll(() => {
    Object.assign(globalThis, { window: {} });
  });
  afterEach(() => jest.restoreAllMocks());

  it("loads a late hourly bucket without reloading the full window", async () => {
    const now = jest
      .spyOn(Date, "now")
      .mockReturnValue(start + 12 * hour + 60000);
    const rows = [
      { start: start + 10 * hour, end: start + 11 * hour, mean: 1 },
    ];
    const callWS = jest.fn(async ({ statistic_ids, start_time, end_time }) =>
      Object.fromEntries(
        statistic_ids.map((id: string) => [
          id,
          rows.filter(
            (row) =>
              row.start >= Date.parse(start_time) &&
              row.start < Date.parse(end_time),
          ),
        ]),
      ),
    );
    const parser = new ConfigParser();
    const yaml: InputConfig = {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities: [
        {
          entity: "sensor.energy",
          statistic: "mean",
          period: "hour",
          type: "bar",
        },
      ],
    };
    const hass = {
      callWS,
      states: {},
      locale: { language: "en" },
    } as unknown as HomeAssistant;
    const update = () => parser.update({ yaml, hass, css_vars: cssVars });
    expect(values((await update()).parsed.entities[0])).toEqual([1]);
    rows.push({ start: start + 11 * hour, end: start + 12 * hour, mean: 2 });
    now.mockReturnValue(start + 12 * hour + 120000);
    await parser.cache.refreshStatistics(Date.now(), "hour");
    const result = await parser.update({
      yaml,
      hass,
      css_vars: cssVars,
      statisticsUpdates: new Set(["hour"]),
    });
    expect(result.errors).toEqual([]);
    expect(values(result.parsed.entities[0])).toEqual([1, 2]);
    expect(Date.parse(callWS.mock.calls[1][0].start_time)).toBe(
      start + 11 * hour - 1,
    );
  });

  it("replaces a partial daily aggregate at the same timestamp", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(start + 12 * hour);
    let mean = 1;
    const callWS = jest.fn(async ({ statistic_ids }) =>
      Object.fromEntries(
        statistic_ids.map((id: string) => [
          id,
          [{ start, end: start + 24 * hour, mean }],
        ]),
      ),
    );
    const parser = new ConfigParser();
    const yaml: InputConfig = {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities: [{ entity: "sensor.energy", statistic: "mean", period: "day" }],
    };
    const hass = {
      callWS,
      states: {},
      locale: { language: "en" },
    } as unknown as HomeAssistant;
    const update = () => parser.update({ yaml, hass, css_vars: cssVars });
    expect(values((await update()).parsed.entities[0])).toEqual([1]);
    mean = 2;
    now.mockReturnValue(start + 13 * hour);
    await parser.cache.refreshStatistics(Date.now(), "hour");
    expect(values((await update()).parsed.entities[0])).toEqual([2]);
  });

  it("does not invalidate live statistics during cached state updates", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(start + 12 * hour);
    const parser = new ConfigParser();
    const callWS = jest.fn(async () => ({
      "sensor.energy": [{ start, end: start + 24 * hour, mean: 2 }],
    }));
    const yaml: InputConfig & { visible_range: [number, number] } = {
      type: "custom:plotly-graph",
      visible_range: [start, Date.now()],
      entities: [{ entity: "sensor.energy", statistic: "mean", period: "day" }],
    };
    const hass = {
      callWS,
      states: {},
      locale: { language: "en" },
    } as unknown as HomeAssistant;
    await parser.update({ yaml, hass, css_vars: cssVars });
    for (let i = 1; i <= 20; i++) {
      now.mockReturnValue(start + 12 * hour + i * 1000);
      await parser.update({
        yaml: { ...yaml, fetch_mask: [false] } as InputConfig,
        hass,
        css_vars: cssVars,
      });
    }
    await parser.update({ yaml, hass, css_vars: cssVars });
    expect(callWS).toHaveBeenCalledTimes(1);
    await parser.cache.refreshStatistics(Date.now());
    await parser.update({ yaml, hass, css_vars: cssVars });
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("fetches only the published group while preserving batching and visibility", async () => {
    const now = jest
      .spyOn(Date, "now")
      .mockReturnValue(start + 12 * hour + 60000);
    const parser = new ConfigParser();
    const callWS = jest.fn(async ({ statistic_ids, period }) =>
      Object.fromEntries(
        statistic_ids.map((id: string) => [
          id,
          [
            {
              start:
                period === "5minute" ? start + 11 * hour + 55 * 60000 : start,
              end: period === "5minute" ? start + 12 * hour : start + 24 * hour,
              mean: 2,
            },
          ],
        ]),
      ),
    );
    const yaml: InputConfig = {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities: [
        { entity: "sensor.short", statistic: "mean", period: "5minute" },
        { entity: "sensor.day_a", statistic: "mean", period: "day" },
        { entity: "sensor.day_b", statistic: "mean", period: "day" },
      ],
    };
    const hass = {
      callWS,
      states: {},
      locale: { language: "en" },
    } as unknown as HomeAssistant;
    await parser.update({ yaml, hass, css_vars: cssVars });
    callWS.mockClear();
    now.mockReturnValue(Date.now() + 5 * 60000);
    await parser.cache.refreshStatistics(Date.now(), "5minute");
    await parser.update({
      yaml,
      hass,
      css_vars: cssVars,
      statisticsUpdates: new Set(["5minute"]),
    });
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0]).toMatchObject({
      period: "5minute",
      statistic_ids: ["sensor.short"],
    });
    callWS.mockClear();
    now.mockReturnValue(Date.now() + hour);
    await parser.cache.refreshStatistics(Date.now(), "hour");
    await parser.update({
      yaml,
      hass,
      css_vars: cssVars,
      statisticsUpdates: new Set(["hour"]),
    });
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0]).toMatchObject({
      period: "day",
      statistic_ids: ["sensor.day_a", "sensor.day_b"],
    });
    callWS.mockClear();
    now.mockReturnValue(Date.now() + 5 * 60000);
    await parser.cache.refreshStatistics(Date.now(), "5minute");
    await parser.update({
      yaml: { ...yaml, fetch_mask: [false, false, false] } as InputConfig,
      hass,
      css_vars: cssVars,
      statisticsUpdates: new Set(["5minute"]),
    });
    expect(callWS).not.toHaveBeenCalled();
  });

  it("publishes statistics periods only after an update completes", async () => {
    jest.spyOn(Date, "now").mockReturnValue(start + 12 * hour);
    const parser = new ConfigParser();
    const callWS = jest.fn(async ({ statistic_ids }) =>
      Object.fromEntries(
        statistic_ids.map((id: string) => [
          id,
          [{ start, end: start + 24 * hour, mean: 2 }],
        ]),
      ),
    );
    const hass = {
      callWS,
      states: {},
      locale: { language: "en" },
    } as unknown as HomeAssistant;
    const yaml: InputConfig = {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities: [{ entity: "sensor.day", statistic: "mean", period: "day" }],
    };
    await parser.update({ yaml, hass, css_vars: cssVars });
    const previousPeriods = parser.statisticsPeriods;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const response = callWS.getMockImplementation()!;
    callWS.mockImplementationOnce(async (request) => {
      started();
      await gate;
      return response(request);
    });
    const pending = parser.update({
      yaml: {
        ...yaml,
        entities: [
          { entity: "sensor.short", statistic: "mean", period: "5minute" },
          { entity: "sensor.hour", statistic: "mean", period: "hour" },
        ],
      },
      hass,
      css_vars: cssVars,
    });
    expect(parser.statisticsPeriods).toBe(previousPeriods);
    await requestStarted;
    expect([...parser.statisticsPeriods]).toEqual(["day"]);
    release();
    const result = await pending;
    expect(result.errors).toEqual([]);
    expect([...parser.statisticsPeriods]).toEqual(["5minute", "hour"]);
    expect([...previousPeriods]).toEqual(["day"]);
  });

  it("does not fetch history alongside a recorder-only statistics update", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(start + 12 * hour);
    const parser = new ConfigParser();
    const callWS = jest.fn(async (request) =>
      Object.fromEntries(
        (request.statistic_ids || request.entity_ids).map((id: string) => [
          id,
          request.type === "recorder/statistics_during_period"
            ? [{ start, end: start + 24 * hour, mean: 2 }]
            : [{ s: "5", lu: (Date.now() - 60000) / 1000 }],
        ]),
      ),
    );
    const yaml: InputConfig = {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities: [
        { entity: "sensor.day", statistic: "mean", period: "day" },
        { entity: "sensor.history", extend_to_present: false },
      ],
    };
    const hass = {
      callWS,
      states: {},
      locale: { language: "en" },
    } as unknown as HomeAssistant;
    const initial = await parser.update({ yaml, hass, css_vars: cssVars });
    expect(initial.errors).toEqual([]);
    expect(callWS.mock.calls.map(([request]) => request.type)).toEqual([
      "recorder/statistics_during_period",
      "history/history_during_period",
    ]);
    callWS.mockClear();
    now.mockReturnValue(Date.now() + hour);
    await parser.cache.refreshStatistics(Date.now(), "hour");
    const result = await parser.update({
      yaml,
      hass,
      css_vars: cssVars,
      statisticsUpdates: new Set(["hour"]),
    });
    expect(result.errors).toEqual([]);
    expect(callWS.mock.calls.map(([request]) => request.type)).toEqual([
      "recorder/statistics_during_period",
    ]);
    expect(values(result.parsed.entities[1])).toEqual(
      values(initial.parsed.entities[1]),
    );
  });

  it("keeps statistics periods from internal data sources", async () => {
    jest.spyOn(Date, "now").mockReturnValue(start + 12 * hour);
    const parser = new ConfigParser();
    const callWS = jest.fn(async () => ({
      "sensor.energy": [{ start, end: start + 24 * hour, mean: 2 }],
    }));
    const result = await parser.update({
      yaml: {
        type: "custom:plotly-graph",
        hours_to_show: 24,
        entities: [
          {
            entity: "sensor.energy",
            statistic: "mean",
            period: "day",
            internal: true,
          },
          { entity: "", type: "bar", x: [new Date(start)], y: [2] },
        ],
      },
      hass: {
        callWS,
        states: {},
        locale: { language: "en" },
      } as unknown as HomeAssistant,
      css_vars: cssVars,
    });
    expect(result.errors).toEqual([]);
    expect(result.parsed.entities).toHaveLength(1);
    expect([...parser.statisticsPeriods]).toEqual(["day"]);
  });

  it("does not fetch during a resize-only update or subscribe for historical statistics", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(start + 12 * hour);
    const parser = new ConfigParser();
    const callWS = jest.fn(async () => ({
      "sensor.energy": [{ start, end: start + 24 * hour, mean: 2 }],
    }));
    const yaml: InputConfig = {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities: [{ entity: "sensor.energy", statistic: "mean", period: "day" }],
    };
    const hass = {
      callWS,
      states: {},
      locale: { language: "en" },
    } as unknown as HomeAssistant;
    await parser.update({ yaml, hass, css_vars: cssVars });
    now.mockReturnValue(start + 13 * hour);
    const resize = await parser.update({
      yaml: { ...yaml, fetch_mask: [false] } as InputConfig,
      hass,
      css_vars: cssVars,
    });
    expect(values(resize.parsed.entities[0])).toEqual([2]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect([...parser.statisticsPeriods]).toEqual(["day"]);
    await parser.update({
      yaml: {
        ...yaml,
        visible_range: [start - 2 * 86400000, start - 86400000],
      } as InputConfig,
      hass,
      css_vars: cssVars,
    });
    expect(parser.statisticsPeriods.size).toBe(0);
  });
});

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
    const result = await update();
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
    expect(values((await update()).parsed.entities[0])).toEqual([2]);
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

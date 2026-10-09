import type { Mock } from "vitest";
import { HomeAssistant } from "custom-card-helpers";
import { STATISTIC_TYPES, Statistics, StatisticValue } from "../recorder-types";
import { EntityConfig, InputConfig } from "../types";
import { ConfigParser } from "./parse-config";
import { HATheme, readThemeColors } from "./themed-layout";
import { getEntityKey } from "../cache/Cache";

vi.mock("../filters/filters", () => ({
  default: {
    multiply: (factor: number) => ({ ys }: { ys: number[] }) => ({
      ys: ys.map((value) => value * factor),
    }),
  },
}));

const NOW = Date.parse("2025-01-02T12:00:00.000Z");
const yValues = (trace: EntityConfig) => ("y" in trace ? trace.y : undefined);
const cssVars: HATheme = {
  ...readThemeColors({ getPropertyValue: () => "" }),
  "card-background-color": "#fff",
  "primary-background-color": "#fff",
  "primary-color": "#000",
  "primary-text-color": "#000",
  "secondary-text-color": "#000",
  "font-family": "Roboto, Noto, sans-serif",
  "font-size": "12px",
  "font-weight": "400",
};
const compatibleEntities: InputConfig["entities"] = [
  {
    entity: "sensor.east",
    statistic: "mean",
    period: "5minute",
  },
  {
    entity: "sensor.west",
    statistic: "mean",
    period: "5minute",
  },
];

function statistic(statisticId: string, mean: number): StatisticValue {
  return {
    statistic_id: statisticId,
    start: "2025-01-02T11:00:00.000Z",
    end: "2025-01-02T12:00:00.000Z",
    last_reset: null,
    max: mean,
    mean,
    min: mean,
    sum: mean,
    state: mean,
  };
}

function successfulCallWS() {
  return vi.fn(async ({ statistic_ids, types }) =>
    Object.fromEntries(
      statistic_ids.map((entityId: string, i: number) => [
        entityId,
        [selectFields(statistic(entityId, i + 1), types)],
      ]),
    ),
  );
}

function selectFields(row: StatisticValue, types?: string[]) {
  if (!types) return row;
  const selected: StatisticValue = {
    statistic_id: row.statistic_id,
    start: row.start,
    end: row.end,
  };
  for (const type of STATISTIC_TYPES) {
    if (types.includes(type)) selected[type] = row[type];
  }
  return selected;
}

function createHass(
  callWS: Mock<(params: Record<string, any>) => Promise<Statistics>>,
): HomeAssistant {
  return {
    callWS,
    locale: {
      language: "en",
      first_weekday: "monday",
    },
    states: {},
  } as unknown as HomeAssistant;
}

function update(
  parser: ConfigParser,
  callWS: Mock<(params: Record<string, any>) => Promise<Statistics>>,
  entities = compatibleEntities,
  config: Partial<InputConfig> & {
    visible_range?: [number, number];
    fetch_mask?: boolean[];
  } = {},
) {
  return parser.update({
    yaml: {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities,
      ...config,
    },
    hass: createHass(callWS),
    css_vars: cssVars,
  });
}

describe("statistics request batching", () => {
  beforeAll(() => {
    (global as any).window = {};
  });

  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws dates in the configured timezone", async () => {
    const callWS = successfulCallWS();
    const result = await update(new ConfigParser(), callWS, compatibleEntities, {
      time_zone: "Pacific/Chatham",
      hours_to_show: "1h",
    });

    expect(result.errors).toEqual([]);
    // NOW is 12:00Z, i.e. 01:45 next day in Chatham (UTC+13:45)
    expect(result.parsed.layout.xaxis!.range).toEqual([
      "2025-01-03 00:45:00.000",
      "2025-01-03 01:45:00.000",
    ]);
    expect(result.parsed.visible_range).toEqual([NOW - 3600000, NOW]);
    for (const trace of result.parsed.entities)
      for (const x of (trace as any).x) expect(typeof x).toBe("string");
  });

  it("falls back to the browser's timezone for an invalid time_zone", async () => {
    const callWS = successfulCallWS();
    const result = await update(new ConfigParser(), callWS, compatibleEntities, {
      time_zone: "Mars/Olympus",
      hours_to_show: "current_day",
    });

    expect(result.errors.map((e) => e.message)).toEqual([
      "time_zone: unknown timezone 'Mars/Olympus'",
    ]);
    const start = new Date(NOW);
    start.setHours(0, 0, 0, 0);
    expect(result.parsed.visible_range[0]).toBe(+start);
    expect(result.parsed.entities.map(yValues)).toEqual([[1], [2]]);
  });

  it("fetches compatible statistics entities in one request", async () => {
    const callWS = successfulCallWS();
    const parser = new ConfigParser();

    const result = await update(parser, callWS);

    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0]).toMatchObject({
      type: "recorder/statistics_during_period",
      statistic_ids: ["sensor.east", "sensor.west"],
      period: "5minute",
      types: ["mean"],
    });
    expect(result.parsed.entities.map(yValues)).toEqual([[1], [2]]);

    await update(parser, callWS);
    expect(callWS).toHaveBeenCalledTimes(1);
  });

  it("bounds batched statistics and refetches pruned data when browsing back", async () => {
    const hour = 3600000;
    const samples = Array.from({ length: 40 }, (_, i) => ({
      timestamp: NOW + (i - 24) * hour,
      value: i,
    }));
    const callWS = vi.fn(async ({ statistic_ids, start_time, end_time }) =>
      Object.fromEntries(
        statistic_ids.map((id: string) => [
          id,
          samples
            .filter(({ timestamp }) =>
              timestamp >= Date.parse(start_time) &&
              timestamp <= Date.parse(end_time),
            )
            .map(({ timestamp, value }) => ({
              ...statistic(id, value),
              start: new Date(timestamp).toISOString(),
              end: new Date(timestamp + hour).toISOString(),
            })),
        ]),
      ),
    );
    const parser = new ConfigParser();

    for (let elapsed = 0; elapsed <= 6; elapsed++) {
      const now = NOW + elapsed * hour;
      vi.mocked(Date.now).mockReturnValue(now);
      const result = await update(parser, callWS, compatibleEntities, {
        hours_to_show: 3,
      });
      expect(result.errors).toEqual([]);
      expect(callWS).toHaveBeenCalledTimes(elapsed + 1);
      expect(callWS.mock.calls[elapsed][0].statistic_ids).toEqual([
        "sensor.east", "sensor.west",
      ]);
      const expected = [21, 22, 23, 24].map((value) => value + elapsed);
      expect(result.parsed.entities.map(yValues)).toEqual([expected, expected]);
      for (const entity of ["sensor.east", "sensor.west"]) {
        const key = getEntityKey({
          entity,
          statistic: "mean",
          period: "5minute",
          types: ["mean"],
        });
        expect(parser.cache.histories[key]).toHaveLength(4);
        expect(parser.cache.ranges[key]).toEqual([[now - 3 * hour, now]]);
      }
    }

    const result = await update(parser, callWS, compatibleEntities, {
      visible_range: [NOW - 3 * hour, NOW],
    });
    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(8);
    expect(callWS.mock.calls[7][0].statistic_ids).toEqual([
      "sensor.east", "sensor.west",
    ]);
    expect(result.parsed.entities.map((trace) => yValues(trace)?.slice(0, 4)))
      .toEqual([[21, 22, 23, 24], [21, 22, 23, 24]]);
  });

  it("keeps incompatible statistics periods in separate requests", async () => {
    const callWS = successfulCallWS();

    await update(new ConfigParser(), callWS, [
      {
        entity: "sensor.five_minute",
        statistic: "mean",
        period: "5minute",
      },
      {
        entity: "sensor.hourly",
        statistic: "mean",
        period: "hour",
      },
    ]);

    expect(callWS).toHaveBeenCalledTimes(2);
    expect(callWS.mock.calls.map(([request]) => request.period)).toEqual([
      "5minute",
      "hour",
    ]);
  });

  it("keeps dynamic entities on the individual request path", async () => {
    const callWS = successfulCallWS();

    const result = await update(new ConfigParser(), callWS, [
      ...compatibleEntities,
      {
        entity: "$fn () => 'sensor.dynamic'",
        statistic: "mean",
        period: "5minute",
      },
    ]);

    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(2);
    expect(callWS.mock.calls.map(([request]) => request.statistic_ids)).toEqual(
      [["sensor.east", "sensor.west"], ["sensor.dynamic"]],
    );
  });

  it("falls back to individual requests when batching fails", async () => {
    const callWS = successfulCallWS();
    const parser = new ConfigParser();
    callWS.mockRejectedValueOnce(new Error("batch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await update(parser, callWS);

    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(3);
    expect(callWS.mock.calls.map(([request]) => request.statistic_ids)).toEqual(
      [["sensor.east", "sensor.west"], ["sensor.east"], ["sensor.west"]],
    );
    expect(result.parsed.entities.map(yValues)).toEqual([[1], [1]]);
    await update(parser, callWS);
    expect(callWS).toHaveBeenCalledTimes(3);
  });

  it("uses one request for four compatible series", async () => {
    const callWS = successfulCallWS();
    const result = await update(
      new ConfigParser(),
      callWS,
      ["east", "west", "north", "south"].map((direction) => ({
        entity: `sensor.${direction}`,
        statistic: "mean",
        period: "5minute",
      })),
    );
    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(result.parsed.entities.map(yValues)).toEqual([[1], [2], [3], [4]]);
  });

  it("does not fetch hidden traces", async () => {
    const callWS = successfulCallWS();
    const result = await update(
      new ConfigParser(),
      callWS,
      compatibleEntities,
      { fetch_mask: [true, false] } as Partial<InputConfig>,
    );
    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0].statistic_ids).toEqual(["sensor.east"]);
  });

  it("shares a response between different statistics for the same entity", async () => {
    const callWS = vi.fn(async ({ types }: Record<string, any>) => ({
      "sensor.east": [
        selectFields({ ...statistic("sensor.east", 4), min: 2, max: 8 }, types),
      ],
    }));
    const result = await update(new ConfigParser(), callWS, [
      { entity: "sensor.east", statistic: "min", period: "hour" },
      {
        entity: "sensor.east", statistic: "max", period: "hour",
        fill: "tonexty",
      },
      { entity: "sensor.east", statistic: "mean", period: "hour" },
      { entity: "sensor.east", statistic: "mean", period: "hour" },
    ]);
    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0].statistic_ids).toEqual(["sensor.east"]);
    expect(callWS.mock.calls[0][0].types).toEqual(["max", "mean", "min"]);
    expect(result.parsed.entities.map(yValues)).toEqual([[2], [8], [4], [4]]);
  });

  it("includes the default mean for period-only traces alongside max", async () => {
    const callWS = vi.fn(async ({ types }: Record<string, any>) => ({
      "sensor.east": [
        selectFields({ ...statistic("sensor.east", 4), max: 8 }, types),
      ],
    }));
    const result = await update(new ConfigParser(), callWS, [
      { entity: "sensor.east", period: "hour" },
      { entity: "sensor.east", statistic: "max", period: "hour" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.parsed.entities.map(yValues)).toEqual([[4], [8]]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0].types).toEqual(["max", "mean"]);
  });

  it("includes statistics supplied by entity defaults", async () => {
    const callWS = successfulCallWS();
    const result = await update(
      new ConfigParser(), callWS,
      [
        { entity: "sensor.east" },
        { entity: "sensor.west", statistic: "max" },
      ],
      {
        defaults: { entity: { period: "hour", statistic: "min" } },
      } as unknown as Partial<InputConfig>,
    );
    expect(result.errors).toEqual([]);
    expect(result.parsed.entities.map(yValues)).toEqual([[1], [2]]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0].types).toEqual(["max", "min"]);
  });

  it("keeps field coverage for cached traces when another trace is refreshed", async () => {
    const parser = new ConfigParser();
    const callWS = successfulCallWS();
    const entities: InputConfig["entities"] = [
      { entity: "sensor.east", statistic: "mean", period: "hour" },
      { entity: "sensor.west", statistic: "max", period: "hour" },
    ];
    await update(parser, callWS, entities);
    const result = await update(parser, callWS, entities, {
      fetch_mask: [false, true],
    });
    expect(result.errors).toEqual([]);
    expect(result.parsed.entities.map(yValues)).toEqual([[1], [2]]);
    expect(callWS).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a partial response when the configured statistic changes", async () => {
    const parser = new ConfigParser();
    const callWS = vi.fn(async ({ types }: Record<string, any>) => ({
      "sensor.east": [
        selectFields({ ...statistic("sensor.east", 4), max: 8 }, types),
      ],
    }));
    const mean = {
      entity: "sensor.east",
      statistic: "mean",
      period: "hour",
    } as const;
    expect(
      (await update(parser, callWS, [mean])).parsed.entities.map(yValues),
    ).toEqual([[4]]);
    expect(
      (
        await update(parser, callWS, [{ ...mean, statistic: "max" }])
      ).parsed.entities.map(yValues),
    ).toEqual([[8]]);
    expect(callWS.mock.calls.map(([request]) => request.types)).toEqual([
      ["mean"],
      ["max"],
    ]);
  });

  it.each([
    { filters: [{ multiply: 2 }] },
    { name: (() => "Temperature") as any },
    { statistic: "$ex 'mean'" as any },
  ])("keeps full statistics for user filters or functions: %p", async (extra) => {
    const callWS = successfulCallWS();
    const result = await update(new ConfigParser(), callWS, [
      { ...compatibleEntities[0], ...extra },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.parsed.entities.map(yValues)).toEqual([
      ["filters" in extra ? 2 : 1],
    ]);
    expect(callWS.mock.calls[0][0]).not.toHaveProperty("types");
  });

  it("keeps full statistics for filters supplied by defaults or presets", async () => {
    const callWS = successfulCallWS();
    for (const config of [
      { defaults: { entity: { filters: [{ multiply: 2 }] } } },
      { preset: "custom" },
    ]) {
      const result = await update(
        new ConfigParser(), callWS, compatibleEntities,
        config as unknown as Partial<InputConfig>,
      );
      expect(result.errors).toEqual([]);
      expect(result.parsed.entities.map(yValues)).toEqual(
        "defaults" in config ? [[2], [4]] : [[1], [2]],
      );
    }
    expect(callWS).toHaveBeenCalledTimes(2);
    for (const [request] of callWS.mock.calls) {
      expect(request).not.toHaveProperty("types");
    }
  });

  it("optimizes time-axis expressions without exposing partial statistics outside entities", async () => {
    const callWS = successfulCallWS();
    const result = await new ConfigParser().update({
      yaml: {
        type: "custom:plotly-graph",
        visible_range: `$fn () => [${NOW - 24 * 3600000}, ${NOW}]`,
        entities: compatibleEntities,
        layout: {
          title: {
            text: "$fn ({ statistics }) => statistics === undefined ? 'No entity statistics' : 'Unexpected statistics'",
          },
        },
      } as InputConfig,
      hass: createHass(callWS),
      css_vars: cssVars,
    });
    expect(result.errors).toEqual([]);
    expect(callWS.mock.calls[0][0].types).toEqual(["mean"]);
    expect(result.parsed.layout.title).toMatchObject({
      text: "No entity statistics",
    });
  });

  it("does not combine different time offsets", async () => {
    const callWS = successfulCallWS();
    const result = await update(new ConfigParser(), callWS, [
      compatibleEntities[0],
      { ...compatibleEntities[1], time_offset: "1h" },
    ]);
    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(2);
    expect(
      Date.parse(callWS.mock.calls[0][0].end_time) -
        Date.parse(callWS.mock.calls[1][0].end_time),
    ).toBe(3600000);
  });

  it("resolves automatic periods before deciding which requests to batch", async () => {
    const callWS = successfulCallWS();
    const result = await update(new ConfigParser(), callWS, [
      { ...compatibleEntities[0], period: "auto" },
      compatibleEntities[1],
    ]);
    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0].period).toBe("5minute");
  });

  it("batches after a dynamic time range has been evaluated", async () => {
    const callWS = successfulCallWS();
    const result = await update(
      new ConfigParser(),
      callWS,
      compatibleEntities,
      {
        hours_to_show: "$fn () => 12",
      } as unknown as Partial<InputConfig>,
    );
    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(Date.parse(callWS.mock.calls[0][0].start_time)).toBe(
      NOW - 12 * 3600000 - 1,
    );
  });

  it("does not prefetch an unevaluated dynamic time range", async () => {
    const callWS = successfulCallWS();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await new ConfigParser().update({
      yaml: {
        type: "custom:plotly-graph",
        entities: compatibleEntities,
        hours_to_show: "$fn () => 12",
      } as unknown as InputConfig,
      hass: createHass(callWS),
      css_vars: cssVars,
    });
    expect(callWS).not.toHaveBeenCalled();
    expect(
      result.errors.some((error) =>
        error.message.includes("has to be defined before"),
      ),
    ).toBe(true);
  });

  it("skips batching an invalid time range without a batching warning", async () => {
    const callWS = successfulCallWS();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await new ConfigParser().update({
      yaml: {
        type: "custom:plotly-graph",
        entities: compatibleEntities,
        hours_to_show: "banana",
      } as unknown as InputConfig,
      hass: createHass(callWS),
      css_vars: cssVars,
    });
    expect(callWS).not.toHaveBeenCalled();
    expect(
      result.errors.some((error) =>
        error.message.includes("banana is not a valid duration"),
      ),
    ).toBe(true);
    expect(
      warn.mock.calls.some(([message]) =>
        String(message).includes("Could not batch"),
      ),
    ).toBe(false);
  });

  it("evaluates dynamic periods without adding them to the static batch", async () => {
    const callWS = successfulCallWS();
    const result = await update(new ConfigParser(), callWS, [
      ...compatibleEntities,
      {
        entity: "sensor.dynamic",
        statistic: "mean",
        period: "$fn () => 'hour'",
      } as any,
    ]);
    expect(result.errors).toEqual([]);
    expect(
      callWS.mock.calls.map(([request]) => [
        request.period,
        request.statistic_ids,
      ]),
    ).toEqual([
      ["5minute", ["sensor.east", "sensor.west"]],
      ["hour", ["sensor.dynamic"]],
    ]);
  });

  it("reports errors when both the batch and individual requests fail", async () => {
    const callWS = vi.fn().mockRejectedValue(new Error("offline"));
    const parser = new ConfigParser();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await update(parser, callWS);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(callWS).toHaveBeenCalledTimes(3);
    callWS.mockImplementation(successfulCallWS());
    const recovered = await update(parser, callWS);
    expect(recovered.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(4);
    expect(recovered.parsed.entities.map(yValues)).toEqual([[1], [2]]);
  });

  it.each([undefined, "temperature"])(
    "reuses history failures for attribute %s and retries on the next update",
    async (attribute) => {
      const callWS = vi.fn().mockRejectedValue(new Error("offline"));
      const parser = new ConfigParser();
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const input = {
        yaml: {
          type: "custom:plotly-graph" as const,
          hours_to_show: 24,
          entities: [{ entity: "sensor.east", attribute }],
        },
        hass: createHass(callWS),
        css_vars: cssVars,
      };

      const failed = await parser.update(input);
      expect(failed.errors.length).toBeGreaterThan(0);
      expect(callWS).toHaveBeenCalledTimes(1);

      callWS.mockResolvedValue({
        "sensor.east": [
          {
            entity_id: "sensor.east",
            state: "4",
            attributes: { temperature: 8 },
            last_changed: "2025-01-02T11:00:00.000Z",
          },
        ],
      });
      const recovered = await parser.update(input);
      expect(recovered.errors).toEqual([]);
      expect(callWS).toHaveBeenCalledTimes(2);
      expect(yValues(recovered.parsed.entities[0])).toEqual(
        attribute ? [8, 8] : ["4", "4"],
      );
    },
  );

  it("keeps failures separate for state, attribute, statistics and time ranges", async () => {
    const callWS = vi.fn().mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await new ConfigParser().update({
      yaml: {
        type: "custom:plotly-graph",
        hours_to_show: 24,
        entities: [
          { entity: "sensor.east" },
          { entity: "sensor.east", attribute: "temperature" },
          { entity: "sensor.east", statistic: "mean", period: "hour" },
          { entity: "sensor.east", time_offset: "1h" },
          { entity: "sensor.east" },
          { entity: "sensor.east", attribute: "humidity" },
        ],
      },
      hass: createHass(callWS),
      css_vars: cssVars,
    });
    // Attributes share one history response; states, statistics and offsets do not.
    // One failed history batch, then one attempt per distinct fetch key/range.
    expect(callWS).toHaveBeenCalledTimes(5);
    expect(callWS.mock.calls.map(([request]) => request.type)).toEqual([
      "history/history_during_period",
      "history/history_during_period",
      "history/history_during_period",
      "recorder/statistics_during_period",
      "history/history_during_period",
    ]);
  });
});

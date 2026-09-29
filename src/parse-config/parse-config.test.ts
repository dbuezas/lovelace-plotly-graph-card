import { HomeAssistant } from "custom-card-helpers";
import { Statistics, StatisticValue } from "../recorder-types";
import { EntityConfig, InputConfig } from "../types";
import { ConfigParser } from "./parse-config";
import { HATheme } from "./themed-layout";
import { getEntityKey } from "../cache/Cache";

jest.mock("../filters/filters", () => ({
  __esModule: true,
  default: {},
}));

const NOW = Date.parse("2025-01-02T12:00:00.000Z");
const yValues = (trace: EntityConfig) => ("y" in trace ? trace.y : undefined);
const cssVars: HATheme = {
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
  return jest.fn(async ({ statistic_ids }) =>
    Object.fromEntries(
      statistic_ids.map((entityId: string, i: number) => [
        entityId,
        [statistic(entityId, i + 1)],
      ]),
    ),
  );
}

function createHass(
  callWS: jest.Mock<Promise<Statistics>, [Record<string, any>]>,
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
  callWS: jest.Mock<Promise<Statistics>, [Record<string, any>]>,
  entities = compatibleEntities,
  config: Partial<InputConfig> & { visible_range?: [number, number] } = {},
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
    jest.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    const callWS = jest.fn(async ({ statistic_ids, start_time, end_time }) =>
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
      jest.mocked(Date.now).mockReturnValue(now);
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
    jest.spyOn(console, "error").mockImplementation();
    jest.spyOn(console, "warn").mockImplementation();

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
    const callWS = jest.fn(async (_request: Record<string, any>) => ({
      "sensor.east": [{ ...statistic("sensor.east", 4), max: 8 }],
    }));
    const result = await update(new ConfigParser(), callWS, [
      { entity: "sensor.east", statistic: "mean", period: "hour" },
      { entity: "sensor.east", statistic: "max", period: "hour" },
    ]);
    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0].statistic_ids).toEqual(["sensor.east"]);
    expect(result.parsed.entities.map(yValues)).toEqual([[4], [8]]);
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
    jest.spyOn(console, "warn").mockImplementation();
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
    const warn = jest.spyOn(console, "warn").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
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
    const callWS = jest.fn().mockRejectedValue(new Error("offline"));
    const parser = new ConfigParser();
    jest.spyOn(console, "error").mockImplementation();
    jest.spyOn(console, "warn").mockImplementation();
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
      const callApi = jest.fn().mockRejectedValue(new Error("offline"));
      const parser = new ConfigParser();
      jest.spyOn(console, "error").mockImplementation();
      jest.spyOn(console, "warn").mockImplementation();
      const input = {
        yaml: {
          type: "custom:plotly-graph" as const,
          hours_to_show: 24,
          entities: [{ entity: "sensor.east", attribute }],
        },
        hass: { ...createHass(successfulCallWS()), callApi },
        css_vars: cssVars,
      };

      const failed = await parser.update(input);
      expect(failed.errors.length).toBeGreaterThan(0);
      expect(callApi).toHaveBeenCalledTimes(1);

      callApi.mockResolvedValue([
        [
          {
            entity_id: "sensor.east",
            state: "4",
            attributes: { temperature: 8 },
            last_changed: "2025-01-02T11:00:00.000Z",
          },
        ],
      ]);
      const recovered = await parser.update(input);
      expect(recovered.errors).toEqual([]);
      expect(callApi).toHaveBeenCalledTimes(2);
      expect(yValues(recovered.parsed.entities[0])).toEqual(
        attribute ? [8, 8] : ["4", "4"],
      );
    },
  );

  it("keeps failures separate for state, attribute, statistics and time ranges", async () => {
    const callApi = jest.fn().mockRejectedValue(new Error("offline"));
    const callWS = jest.fn().mockRejectedValue(new Error("offline"));
    jest.spyOn(console, "error").mockImplementation();
    jest.spyOn(console, "warn").mockImplementation();
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
      hass: { ...createHass(callWS), callApi },
      css_vars: cssVars,
    });
    // Attributes share one history response; states, statistics and offsets do not.
    expect(callApi).toHaveBeenCalledTimes(3);
    expect(callWS).toHaveBeenCalledTimes(1);
  });
});

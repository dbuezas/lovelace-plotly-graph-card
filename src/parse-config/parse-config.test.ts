import { HomeAssistant } from "custom-card-helpers";
import { Statistics, StatisticValue } from "../recorder-types";
import { EntityConfig, InputConfig } from "../types";
import { ConfigParser } from "./parse-config";
import { HATheme } from "./themed-layout";

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
  config: Partial<InputConfig> = {},
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
      { ...compatibleEntities[1], time_offset: "1h" } as any,
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
});

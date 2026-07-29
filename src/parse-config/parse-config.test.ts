import { HomeAssistant } from "custom-card-helpers";
import { Statistics, StatisticValue } from "../recorder-types";
import { InputConfig } from "../types";
import { ConfigParser } from "./parse-config";
import { HATheme } from "./themed-layout";

jest.mock("../filters/filters", () => ({
  __esModule: true,
  default: {},
}));

const NOW = Date.parse("2025-01-02T12:00:00.000Z");
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
      ])
    )
  );
}

function createHass(
  callWS: jest.Mock<Promise<Statistics>, [Record<string, any>]>
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
  entities = compatibleEntities
) {
  return parser.update({
    yaml: {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities,
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
    expect(result.parsed.entities.map(({ y }) => y)).toEqual([[1], [2]]);

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
    expect(callWS.mock.calls.map(([request]) => request.statistic_ids)).toEqual([
      ["sensor.east", "sensor.west"],
      ["sensor.dynamic"],
    ]);
  });

  it("falls back to individual requests when batching fails", async () => {
    const callWS = successfulCallWS();
    callWS.mockRejectedValueOnce(new Error("batch failed"));
    jest.spyOn(console, "error").mockImplementation();
    jest.spyOn(console, "warn").mockImplementation();

    const result = await update(new ConfigParser(), callWS);

    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(3);
    expect(callWS.mock.calls.map(([request]) => request.statistic_ids)).toEqual([
      ["sensor.east", "sensor.west"],
      ["sensor.east"],
      ["sensor.west"],
    ]);
  });
});

import { addPreParsingDefaults } from "./defaults";
import { getStatisticsTypes } from "./statistics-types";
import { InputConfig } from "../types";

const base: InputConfig = {
  type: "custom:plotly-graph",
  entities: [
    { entity: "sensor.temperature", statistic: "mean", period: "hour" },
  ],
};

function types(input: InputConfig) {
  return getStatisticsTypes(input, addPreParsingDefaults(input, {} as any));
}

beforeAll(() => {
  (global as any).window = {};
});

it("ignores functions injected by built-in defaults", () => {
  expect(types(base)).toEqual(["mean"]);
});

it("includes static defaults and every trace in a canonical union", () => {
  expect(
    types({
      ...base,
      defaults: { entity: { statistic: "min", period: "hour" } } as any,
      entities: [
        { entity: "sensor.one" },
        { entity: "sensor.two", statistic: "max" },
        ...base.entities,
        ...base.entities,
      ],
    }),
  ).toEqual(["max", "mean", "min"]);
});

it("allows empty filters", () => {
  expect(
    types({ ...base, entities: [{ ...base.entities[0], filters: [] }] }),
  ).toEqual(["mean"]);
});

it.each([
  { defaults: { entity: { filters: [{ map_y: "statistics[i].max" }] } } },
  { entities: [{ ...base.entities[0], filters: [{ multiply: 2 }] }] },
  {
    entities: [
      { ...base.entities[0], customdata: "$fn ({ statistics }) => statistics" },
    ],
  },
  { entities: [{ ...base.entities[0], statistic: "$ex 'mean'" }] },
  { preset: "custom" },
])(
  "keeps full responses when user code may inspect statistics: %p",
  (overrides) => {
    expect(types({ ...base, ...overrides } as InputConfig)).toBeUndefined();
  },
);

it("keeps full responses for native functions", () => {
  expect(
    getStatisticsTypes(
      {
        ...base,
        entities: [{ ...base.entities[0], name: (() => "Name") as any }],
      },
      base,
    ),
  ).toBeUndefined();
});

it("allows range and layout functions, which do not receive entity statistics", () => {
  const input = {
    ...base,
    visible_range: "$fn () => [0, Date.now()]",
    layout: { xaxis: { ticktext: "$fn () => ['00:00']" as any } },
  };
  expect(types(input)).toEqual(["mean"]);
});

it("does not select fields for history-only cards", () => {
  expect(
    types({ ...base, entities: [{ entity: "sensor.one" }] }),
  ).toBeUndefined();
});

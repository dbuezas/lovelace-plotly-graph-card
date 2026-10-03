import { ConfigParser } from "./parse-config";
import { EntityConfig, InputConfig } from "../types";

const HOUR = 3600000;
const START = Date.parse("2025-01-02T00:00:00Z");
const timestamps = [-1, 0, 1, 2, 3].map((hour) => START + hour * HOUR);
const values = [1000, 10, 20, 30, 2000];
const coordinates = (entity: EntityConfig) => {
  if (!("x" in entity) || !("y" in entity)) throw new Error("Missing x/y");
  return { xs: Array.from(entity.x || [], Number), ys: entity.y };
};

function setup(options: Partial<Omit<InputConfig, "entities">> & { entities?: object[] } = {}) {
  const source = { xs: timestamps.map((x) => new Date(x)), ys: values };
  const hass = {
    states: { "sensor.generated": { attributes: { data: source } } },
    locale: { language: "en", first_weekday: "monday" },
  };
  const parser = new ConfigParser();
  const update = (range: [number, number] = [START, START + 2 * HOUR]) =>
    parser.update({
      yaml: {
        type: "custom:plotly-graph",
        ha_theme: false,
        visible_range: range,
        autorange_after_scroll: true,
        ...options,
        entities: [{
          entity: "",
          type: "bar",
          filters: [{ fn: '({ hass }) => hass.states["sensor.generated"].attributes.data' }],
          ...options.entities?.[0],
        }],
      } as unknown as InputConfig,
      hass: hass as any,
      css_vars: {} as any,
    });
  return { source, update };
}

describe("autorange after custom filters", () => {
  beforeAll(() => {
    (global as any).window = {};
  });
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(START + 4 * HOUR);
  });
  afterEach(() => jest.restoreAllMocks());

  it("excludes out-of-range values returned by a custom filter", async () => {
    const { source, update } = setup();
    const result = await update();

    expect(result.errors).toEqual([]);
    expect(coordinates(result.parsed.entities[0])).toEqual({
      xs: timestamps.slice(1, 4),
      ys: [10, 20, 30],
    });
    expect(source.xs.map(Number)).toEqual(timestamps);
    expect(source.ys).toEqual(values);
  });

  it("uses the new visible range when browsing", async () => {
    const { update } = setup();
    await update();
    const result = await update([START + HOUR, START + 3 * HOUR]);

    expect(result.errors).toEqual([]);
    expect(coordinates(result.parsed.entities[0])).toEqual({
      xs: timestamps.slice(2),
      ys: [20, 30, 2000],
    });
  });

  it("keeps all generated data when autorange_after_scroll is disabled", async () => {
    const result = await setup({ autorange_after_scroll: false }).update();
    expect(result.errors).toEqual([]);
    expect(coordinates(result.parsed.entities[0])).toEqual({
      xs: timestamps,
      ys: values,
    });
  });

  it("leaves raw Plotly configurations unchanged", async () => {
    const result = await setup({
      raw_plotly_config: true,
      entities: [{ entity: "", x: "$ex xs", y: "$ex ys" }],
    }).update();
    expect(result.errors).toEqual([]);
    expect(coordinates(result.parsed.entities[0])).toEqual({
      xs: timestamps,
      ys: values,
    });
  });

  it("clips only after the entire filter chain", async () => {
    const result = await setup({
      entities: [{
        entity: "",
        filters: [
          { fn: '({ hass }) => hass.states["sensor.generated"].attributes.data' },
          { fn: '({ xs, ys }) => ({ xs, ys: ys.map(() => ys.length) })' },
        ],
        x: "$ex xs",
        y: "$ex ys",
      }],
    }).update();
    expect(result.errors).toEqual([]);
    expect(coordinates(result.parsed.entities[0])).toEqual({
      xs: timestamps.slice(1, 4),
      ys: [5, 5, 5],
    });
  });

  it("keeps state and statistics metadata aligned with the remaining points", async () => {
    const result = await setup({
      entities: [{
        entity: "",
        filters: [{ fn: `({ hass }) => {
          const data = hass.states["sensor.generated"].attributes.data;
          return {
            ...data,
            states: data.ys.map((value) => ({ state: String(value) })),
            statistics: data.ys.map((value) => ({ mean: value })),
          };
        }` }],
        customdata: "$ex states.map((state, i) => [state.state, statistics[i].mean])",
      }],
    }).update();
    expect(result.errors).toEqual([]);
    expect(result.parsed.entities[0]).toHaveProperty("customdata", [
      ["10", 10], ["20", 20], ["30", 30],
    ]);
  });

  it("keeps the legend placeholder when no generated points are visible", async () => {
    const result = await setup().update([START + 5 * HOUR, START + 6 * HOUR]);
    expect(result.errors).toEqual([]);
    expect(coordinates(result.parsed.entities[0]).ys).toEqual([null]);
  });
});

import { ConfigParser } from "./parse-config";
import { getEntityKey } from "../cache/Cache";
import type { EntityConfig } from "../types";

jest.mock("../filters/filters", () => ({ __esModule: true, default: {} }));

const HOUR = 3600000;
const BASE = Date.parse("2025-01-01T00:00:00Z");
const sensor = { entity: "sensor.one" };
const key = getEntityKey(sensor);
const ys = (trace: EntityConfig) => ("y" in trace ? trace.y : undefined);
function state(timestamp: number, value = String((timestamp - BASE) / HOUR)) {
  return {
    entity_id: sensor.entity,
    state: value,
    attributes: { temperature: Number(value) },
    last_updated: new Date(timestamp).toISOString(),
    last_changed: new Date(timestamp).toISOString(),
    context: { id: "", parent_id: null, user_id: null },
  };
}
function setup() {
  const samples = Array.from({ length: 200 }, (_, i) => state(BASE + i * HOUR));
  const callApi = jest.fn(async (_method, uri) => {
    const [path, query] = uri.split("?");
    const start = Date.parse(path.replace("history/period/", ""));
    const end = Date.parse(new URLSearchParams(query).get("end_time")!);
    const previous = samples
      .filter((sample) => Date.parse(sample.last_updated) < start)
      .at(-1);
    const boundary = previous ? [state(start, previous.state)] : [];
    return [
      [
        ...boundary,
        ...samples.filter(
          (sample) =>
            Date.parse(sample.last_updated) >= start &&
            Date.parse(sample.last_updated) <= end,
        ),
      ],
    ];
  });
  const hass = {
    callApi,
    states: { [sensor.entity]: state(Date.now()) },
    locale: { language: "en", first_weekday: "monday" },
  };
  const parser = new ConfigParser();
  const update = (extra: object = {}, entities: object[] = [sensor]) =>
    parser.update({
      yaml: {
        type: "custom:plotly-graph",
        hours_to_show: 3,
        fetch_mask: [],
        ...extra,
        entities: entities.map((entity) => ({
          extend_to_present: false,
          ...entity,
        })),
      } as any,
      hass: hass as any,
      css_vars: {} as any,
    });
  return { parser, callApi, update };
}

describe("ConfigParser cache retention", () => {
  beforeAll(() => {
    (global as any).window = {};
  });
  beforeEach(() => {
    jest.useFakeTimers({ now: BASE + 24 * HOUR });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ["hours_to_show", {}],
    [
      "$fn visible_range",
      { visible_range: "$fn () => [Date.now() - 10800000, Date.now()]" },
    ],
    [
      "$ex visible_range",
      { visible_range: "$ex [Date.now() - 10800000, Date.now()]" },
    ],
    [
      "function visible_range",
      { visible_range: () => [Date.now() - 3 * HOUR, Date.now()] },
    ],
  ])("bounds rolling updates using %s", async (_name, config) => {
    const { parser, update } = setup();
    for (let hour = 24; hour < 84; hour++) {
      jest.setSystemTime(BASE + hour * HOUR);
      const result = await update(config as object);
      expect(result.errors).toEqual([]);
      expect(ys(result.parsed.entities[0])).toEqual(
        [hour - 3, hour - 2, hour - 1, hour].map(String),
      );
      expect(parser.cache.histories[key]).toHaveLength(4);
      expect(parser.cache.ranges[key]).toEqual([
        [Date.now() - 3 * HOUR, Date.now()],
      ]);
    }
  });

  it("preserves previously visited ranges while manually browsing", async () => {
    const { parser, callApi, update } = setup();
    await update({ visible_range: [BASE + 20 * HOUR, BASE + 24 * HOUR] });
    await update({ visible_range: [BASE + 16 * HOUR, BASE + 20 * HOUR] });
    const before = callApi.mock.calls.length;
    const result = await update({
      visible_range: [BASE + 20 * HOUR, BASE + 24 * HOUR],
    });
    expect(result.errors).toEqual([]);
    expect(callApi).toHaveBeenCalledTimes(before);
    expect(parser.cache.ranges[key]).toEqual([
      [BASE + 16 * HOUR, BASE + 24 * HOUR],
    ]);
  });

  it("prunes browsing history when autorange_after_scroll is enabled", async () => {
    const { parser, update } = setup();
    await update({ visible_range: [BASE + 16 * HOUR, BASE + 20 * HOUR] });
    await update({
      visible_range: [BASE + 20 * HOUR, BASE + 24 * HOUR],
      autorange_after_scroll: true,
    });
    expect(parser.cache.ranges[key]).toEqual([
      [BASE + 20 * HOUR, BASE + 24 * HOUR],
    ]);
    expect(parser.cache.histories[key]).toHaveLength(5);
  });

  it("refetches pruned history when scrolling back", async () => {
    const { callApi, update } = setup();
    await update();
    jest.setSystemTime(BASE + 30 * HOUR);
    await update();
    const before = callApi.mock.calls.length;
    const result = await update({
      visible_range: [BASE + 21 * HOUR, BASE + 24 * HOUR],
    });
    expect(result.errors).toEqual([]);
    expect(callApi.mock.calls.length).toBeGreaterThan(before);
    expect(ys(result.parsed.entities[0])?.slice(0, 4)).toEqual([
      "21",
      "22",
      "23",
      "24",
    ]);
  });

  it("retains ranges for a shared entity with multiple offsets", async () => {
    const { parser, update } = setup();
    const result = await update({}, [
      sensor,
      { ...sensor, time_offset: "24h" },
    ]);
    expect(result.errors).toEqual([]);
    expect(ys(result.parsed.entities[0])).toEqual(["21", "22", "23", "24"]);
    expect(ys(result.parsed.entities[1])).toEqual(["0"]);
    expect(parser.cache.ranges[key]).toEqual([
      [BASE - 3 * HOUR, BASE],
      [BASE + 21 * HOUR, BASE + 24 * HOUR],
    ]);
  });

  it("removes entities no longer configured", async () => {
    const { parser, update } = setup();
    await update();
    await update({}, [{ entity: "", x: [1], y: [2] }]);
    expect(parser.cache.histories).toEqual({});
    expect(parser.cache.ranges).toEqual({});
  });

  it("preserves a live state arriving during a rolling history request", async () => {
    const { parser, callApi, update } = setup();
    const liveTime = Date.now() + 1000;
    callApi.mockImplementationOnce(async () => {
      parser.cache.add(
        sensor,
        [{ x: new Date(liveTime), y: null, state: state(liveTime, "99") }],
        [liveTime, liveTime],
      );
      return [[state(Date.now() - HOUR, "23")]];
    });
    const result = await update();
    expect(result.errors).toEqual([]);
    expect(parser.cache.getData(sensor).ys.at(-1)).toBe("99");
    expect(ys(result.parsed.entities[0])).not.toContain("99");
  });
});

import { HomeAssistant } from "custom-card-helpers";
import { ConfigParser } from "./parse-config";
import { HATheme } from "./themed-layout";
import { InputConfig } from "../types";

const NOW = Date.parse("2026-10-03T12:00:00Z");
const HOUR = 3600000;
const entity = "sensor.power";
const samples = Array.from({ length: 241 }, (_, i) => ({
  s: String(i),
  lu: (NOW - 4 * HOUR + i * 60000) / 1000,
}));

function createHass(): HomeAssistant {
  return {
    locale: { language: "en", first_weekday: "monday" },
    states: {},
    callWS: jest.fn(async ({ entity_ids, start_time, end_time }) => {
      const start = Date.parse(start_time) / 1000;
      const end = Date.parse(end_time) / 1000;
      const preceding = samples.filter(({ lu }) => lu < start).slice(-1);
      const within = samples.filter(({ lu }) => lu >= start && lu < end);
      return Object.fromEntries(
        entity_ids.map((id: string) => [id, [...preceding, ...within]]),
      );
    }),
  } as unknown as HomeAssistant;
}

describe("shifted history extension", () => {
  beforeEach(() => {
    Object.assign(global, { window: { eval } });
    jest.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, "window");
  });

  it.each(
    [true, false].flatMap((autorange) =>
      [false, true].flatMap((resample) =>
        [-450, 0, 450].map((offset) => ({ autorange, resample, offset })),
      ),
    ),
  )(
    "keeps the endpoint ordered when browsing: $autorange / $resample / $offset",
    async ({ autorange, resample, offset }) => {
      const parser = new ConfigParser();
      const hass = createHass();
      const yaml: InputConfig = {
        type: "custom:plotly-graph",
        hours_to_show: 1,
        autorange_after_scroll: autorange,
        entities: [
          {
            entity,
            time_offset: `${offset}s`,
            ...(resample ? { filters: [{ resample: "5s" }] } : {}),
          },
        ],
      };

      // Initial load, two pans into history, then return to the live window.
      for (const end of [NOW, NOW - HOUR, NOW - 2 * HOUR, NOW]) {
        const rangedYaml: InputConfig & { visible_range: [number, number] } = {
          ...yaml,
          visible_range: [end - HOUR, end],
        };
        const { parsed, errors } = await parser.update({
          yaml: rangedYaml,
          hass,
          css_vars: {} as HATheme,
        });
        expect(errors).toEqual([]);
        const trace = parsed.entities[0];
        if (!("x" in trace) || !Array.isArray(trace.x)) {
          throw new Error("Expected a history trace");
        }
        const xs = trace.x.map((x) => Number(x));
        expect(xs.length).toBeGreaterThan(1);
        expect(xs.every((x, i) => i === 0 || x >= xs[i - 1])).toBe(true);
        const retainedEnd = autorange ? end : NOW;
        const expectedEnd = Math.min(retainedEnd, NOW + offset * 1000);
        // Resampling excludes the final boundary; it must not lose 450 seconds.
        expect(xs[xs.length - 1]).toBe(expectedEnd - (resample ? 5000 : 0));
      }
    },
  );

  it("does not duplicate an existing endpoint", async () => {
    const parser = new ConfigParser();
    const hass = createHass();
    Object.assign(hass, {
      callWS: jest.fn(async () => ({
        [entity]: [{ s: "42", lu: NOW / 1000 }],
      })),
    });
    const { parsed, errors } = await parser.update({
      yaml: {
        type: "custom:plotly-graph",
        entities: [{ entity }],
        hours_to_show: 1,
      },
      hass,
      css_vars: {} as HATheme,
    });
    expect(errors).toEqual([]);
    expect(parsed.entities[0]).toMatchObject({ x: [new Date(NOW)], y: ["42"] });
  });

  it("uses the request cutoff when fetching takes time", async () => {
    const hass = createHass();
    const callWS = hass.callWS;
    Object.assign(hass, {
      callWS: async (request: Parameters<HomeAssistant["callWS"]>[0]) => {
        const response = await callWS(request);
        jest.mocked(Date.now).mockReturnValue(NOW + 60000);
        return response;
      },
    });
    const { parsed, errors } = await new ConfigParser().update({
      yaml: {
        type: "custom:plotly-graph",
        hours_to_show: 1,
        entities: [{ entity, time_offset: "-450s" }],
      },
      hass,
      css_vars: {} as HATheme,
    });
    expect(errors).toEqual([]);
    const trace = parsed.entities[0];
    if (!("x" in trace) || !Array.isArray(trace.x)) {
      throw new Error("Expected a history trace");
    }
    expect(Number(trace.x[trace.x.length - 1])).toBe(NOW - 450000);
  });
});

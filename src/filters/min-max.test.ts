import { minMaxIndices } from "./min-max";
import filters from "./filters";
import type { HomeAssistant } from "custom-card-helpers";

describe("min_max", () => {
  it("keeps bucket extrema at their original coordinates and metadata", () => {
    const ys = [0, "9", "-7", 2, 1, -3, 8, 4, 0, 5];
    const xs = ys.map((_, i) => i + 0.25);
    const states = ys.map((state) => ({
      entity_id: "sensor.test",
      state: String(state),
      attributes: {},
      last_changed: "",
      last_updated: "",
      context: { id: "", parent_id: null, user_id: null },
    }));
    const statistics = ys.map((mean, i) => ({
      statistic_id: "sensor.test",
      mean: Number(mean),
      start: new Date(i).toISOString(),
      end: new Date(i + 1).toISOString(),
    }));
    const result = filters.min_max(6)({
      xs,
      ys,
      states,
      statistics,
      meta: {},
      vars: {},
      hass: {} as HomeAssistant,
    });
    expect(result).toEqual({
      xs: [0.25, 1.25, 2.25, 5.25, 6.25, 9.25],
      ys: [0, "9", "-7", -3, 8, 5],
      states: [0, 1, 2, 5, 6, 9].map((i) => states[i]),
      statistics: [0, 1, 2, 5, 6, 9].map((i) => statistics[i]),
    });
    expect(ys).toEqual([0, "9", "-7", 2, 1, -3, 8, 4, 0, 5]);
  });

  it("preserves missing runs and their finite neighbours", () => {
    const ys = [
      1,
      2,
      null,
      "",
      "unavailable",
      "unknown",
      3,
      4,
      Infinity,
      5,
      6,
      7,
    ];
    expect(
      minMaxIndices(
        ys.map((_, i) => i),
        ys,
        4,
      ),
    ).toEqual([0, 1, 2, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("leaves small and empty inputs unchanged", () => {
    expect(minMaxIndices([], [], 4)).toEqual([]);
    expect(minMaxIndices([1, 2, 3], ["1", null, "3"], 4)).toEqual([0, 1, 2]);
  });

  it("retains viewport neighbours even between sparse measurements", () => {
    const xs = [0, 10, 20, 30, 40].map((time) => new Date(time));
    const ys = [0, 1, 2, 3, 4];
    expect(minMaxIndices(xs, ys, 4, [12, 28])).toEqual([1, 2, 3]);
    expect(minMaxIndices(xs, ys, 4, [12, 18])).toEqual([1, 2]);
    expect(minMaxIndices(xs, ys, 4, [50, 60])).toEqual([4]);
    expect(minMaxIndices(xs, ys, 4, [-20, -10])).toEqual([0]);
  });

  it("bounds dense finite series, including odd point targets", () => {
    const xs = Array.from({ length: 86400 }, (_, i) => i);
    const ys = xs.map((x) => Math.sin(x));
    for (const limit of [4, 5, 999, 1000]) {
      const indices = minMaxIndices(xs, ys, limit);
      expect(indices.length).toBeLessThanOrEqual(limit);
      expect(indices[0]).toBe(0);
      expect(indices.at(-1)).toBe(xs.length - 1);
    }
  });

  it.each([0, 3, 4.5, NaN, Infinity])(
    "rejects invalid point target %s",
    (limit) => {
      expect(() => minMaxIndices([], [], limit)).toThrow("at least 4");
    },
  );
});

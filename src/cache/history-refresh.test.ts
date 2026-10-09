import type { HomeAssistant } from "custom-card-helpers";
import Cache from "./Cache";
import { mapStates } from "./fetch-states";

const start = Date.parse("2026-10-08T12:00:00Z");
const second = 1000;
const entity = { entity: "sensor.temperature" };

function recorder() {
  const rows = [
    { s: "1", lu: (start - second) / 1000 },
    { s: "2", lu: (start + 3 * second) / 1000 },
  ];
  const callWS = vi.fn(async ({ start_time, end_time, entity_ids }) => {
    const first = Date.parse(start_time) / 1000;
    const last = Date.parse(end_time) / 1000;
    const preceding = rows.filter(({ lu }) => lu < first).at(-1);
    const history = [
      ...(preceding ? [{ ...preceding, lu: first }] : []),
      ...rows.filter(({ lu }) => lu > first && lu < last),
    ];
    return Object.fromEntries(entity_ids.map((id: string) => [id, history]));
  });
  return { rows, callWS, hass: { callWS } as unknown as HomeAssistant };
}

describe("late recorder history", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not mark frontend fallback samples as complete history", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(start + 10 * second);
    const cache = new Cache();
    const { rows, hass } = recorder();
    await cache.fetch([start, Date.now()], entity, hass);
    rows.push({ s: "3", lu: (start + 6 * second) / 1000 });
    cache.add(
      entity,
      mapStates(entity.entity, [
        {
          s: "4",
          lu: (start + 8 * second) / 1000,
        },
      ]),
    );
    expect(cache.ranges[entity.entity]).toEqual([[start, start + 10 * second]]);
    clock.mockReturnValue(start + 20 * second);
    await cache.fetch([start, Date.now()], entity, hass);
    expect(cache.getData(entity).ys).toEqual(["1", "2", "3", "4"]);
  });

  it.each(["single", "batched"])(
    "recovers a late state through the %s path",
    async (path) => {
      const cache = new Cache();
      const { rows, hass } = recorder();
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(start + 10 * second);
      const fetch = () =>
        path === "single"
          ? cache.fetch([start, Date.now()], entity, hass)
          : cache.prefetchHistory(
              [{ entity, range: [start, Date.now()] }],
              hass,
            );
      await fetch();
      rows.push({ s: "3", lu: (start + 8 * second) / 1000 });
      clock.mockReturnValue(start + 20 * second);
      await fetch();
      expect(cache.getData(entity).ys).toEqual(["1", "2", "3"]);
    },
  );

  it("does not fetch the same live tail twice within one parse", async () => {
    vi.spyOn(Date, "now").mockReturnValue(start + 10 * second);
    const cache = new Cache();
    const { hass, callWS } = recorder();
    const range: [number, number] = [start, Date.now()];
    await cache.prefetchHistory([{ entity, range }], hass, Date.now());
    await cache.fetch(range, entity, hass, [range], Date.now());
    expect(callWS).toHaveBeenCalledTimes(1);
  });

  it("keeps historical ranges cached and only revisits the unconfirmed live tail", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(start + 10 * second);
    const cache = new Cache();
    const { hass, callWS } = recorder();
    await cache.fetch([start, Date.now()], entity, hass);
    clock.mockReturnValue(start + 20 * second);
    await cache.fetch([start, start + 2 * second], entity, hass);
    expect(callWS).toHaveBeenCalledTimes(1);
    await cache.fetch([start, Date.now()], entity, hass);
    expect(Date.parse(callWS.mock.calls[1][0].start_time)).toBe(
      start + 3 * second,
    );
  });

  it("recovers after an initially empty live response", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(start + 10 * second);
    const cache = new Cache();
    const { rows, hass } = recorder();
    rows.length = 0;
    await cache.fetch([start, Date.now()], entity, hass);
    rows.push({ s: "1", lu: (start + 5 * second) / 1000 });
    clock.mockReturnValue(start + 20 * second);
    await cache.fetch([start, Date.now()], entity, hass);
    expect(cache.getData(entity).ys).toEqual(["1"]);
  });

  it("retains visible data after a failed retry and tries the missing tail again", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(start + 10 * second);
    const cache = new Cache();
    const { rows, hass, callWS } = recorder();
    await cache.fetch([start, Date.now()], entity, hass);
    rows.push({ s: "3", lu: (start + 8 * second) / 1000 });
    clock.mockReturnValue(start + 20 * second);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    callWS.mockRejectedValueOnce(new Error("offline"));
    await expect(
      cache.fetch([start, Date.now()], entity, hass),
    ).rejects.toThrow("offline");
    expect(cache.getData(entity).ys).toEqual(["1", "2"]);
    await cache.fetch([start, Date.now()], entity, hass);
    expect(cache.getData(entity).ys).toEqual(["1", "2", "3"]);
    error.mockRestore();
  });
});

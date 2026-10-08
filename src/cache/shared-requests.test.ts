import type { HomeAssistant } from "custom-card-helpers";
import {
  requestCardData,
  HistoryRequest,
  StatisticsRequest,
} from "./shared-requests";
import fetchStatistics from "./fetch-statistics";
import { fetchStatesBatch } from "./fetch-states";
import Cache from "./Cache";

const start = Date.parse("2025-01-01T00:00:00Z");
const end = start + 24 * 3600000;
const history = (ids = ["sensor.one"], offset = 0): HistoryRequest => ({
  type: "history/history_during_period",
  start_time: new Date(start + offset).toISOString(),
  end_time: new Date(end + offset).toISOString(),
  entity_ids: ids,
  include_start_time_state: true,
  significant_changes_only: false,
  minimal_response: true,
  no_attributes: true,
});
const statistics = (ids = ["sensor.one"]): StatisticsRequest => ({
  type: "recorder/statistics_during_period",
  start_time: new Date(start).toISOString(),
  end_time: new Date(end).toISOString(),
  statistic_ids: ids,
  period: "hour",
});
const hass = (callWS: jest.Mock, connection: object = {}): HomeAssistant =>
  ({ callWS, connection }) as unknown as HomeAssistant;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("shared card requests", () => {
  it("batches entity sets across HA state snapshots on the same connection", async () => {
    const callWS = jest.fn().mockResolvedValue({});
    const connection = {};
    const a = requestCardData(
      hass(callWS, connection),
      history(["sensor.one", "sensor.two"]),
    );
    const b = requestCardData(
      hass(callWS, connection),
      history(["sensor.two", "sensor.three"]),
    );
    expect(callWS).not.toHaveBeenCalled();
    await Promise.all([a, b]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0].entity_ids).toEqual([
      "sensor.one",
      "sensor.two",
      "sensor.three",
    ]);
  });

  it("shares requests reached through asynchronous parser steps in the same turn", async () => {
    const callWS = jest.fn().mockResolvedValue({});
    const ha = hass(callWS);
    const a = requestCardData(ha, history());
    await Promise.resolve();
    await Promise.resolve();
    const b = requestCardData(ha, history(["sensor.two"], 4));
    await Promise.all([a, b]);
    expect(callWS).toHaveBeenCalledTimes(1);
  });

  it("projects millisecond differences, rebuilding the boundary and excluding end points", async () => {
    const rows = [
      { s: "0", lu: start / 1000 },
      { s: "1", lu: (start + 2) / 1000, lc: (start - 10) / 1000 },
      { s: "2", lu: (start + 5) / 1000 },
      { s: "unavailable", lu: (end - 1) / 1000 },
      { s: "unknown", lu: end / 1000 },
      { s: "3", lu: (end + 3) / 1000 },
      { s: "4", lu: (end + 4) / 1000 },
    ];
    const callWS = jest.fn().mockResolvedValue({ "sensor.one": rows });
    const ha = hass(callWS);
    const [a, b] = await Promise.all([
      requestCardData(ha, history()),
      requestCardData(ha, history(undefined, 4)),
    ]);
    expect(callWS.mock.calls[0][0].start_time).toBe(
      new Date(start).toISOString(),
    );
    expect(callWS.mock.calls[0][0].end_time).toBe(
      new Date(end + 4).toISOString(),
    );
    expect(a["sensor.one"]).toEqual(rows.slice(0, 4));
    expect(b["sensor.one"]).toEqual([
      { s: "1", lu: (start + 4) / 1000 },
      ...rows.slice(2, 6),
    ]);
  });

  it("refetches an exact start boundary when minimal history has omitted later equal states", async () => {
    const changes = [
      { s: "0", lu: start / 1000 },
      { s: "1", lu: (start + 2) / 1000 },
      { s: "2", lu: (start + 4) / 1000 },
      { s: "2", lu: (start + 5) / 1000 },
    ];
    const callWS = jest.fn(async (request: HistoryRequest) => {
      const boundary = Date.parse(request.start_time) / 1000;
      const end = Date.parse(request.end_time) / 1000;
      const previous = changes.filter(({ lu }) => lu < boundary).at(-1);
      const rows = previous ? [{ s: previous.s, lu: boundary }] : [];
      for (const row of changes) {
        if (row.lu > boundary && row.lu < end && rows.at(-1)?.s !== row.s)
          rows.push(row);
      }
      return { "sensor.one": rows };
    });
    const ha = hass(callWS);
    const [a, b] = await Promise.all([
      requestCardData(ha, history()),
      requestCardData(ha, history(undefined, 4)),
    ]);
    expect(callWS).toHaveBeenCalledTimes(2);
    expect(a["sensor.one"]).toEqual(changes.slice(1, 3));
    expect(b["sensor.one"]).toEqual([
      { s: "1", lu: (start + 4) / 1000 },
      { s: "2", lu: (start + 5) / 1000 },
    ]);
  });

  it("reuses an in-flight superset for a smaller history window without fetching extra data", async () => {
    let finish!: (data: unknown) => void;
    const callWS = jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const ha = hass(callWS);
    const a = requestCardData(ha, history(["sensor.one", "sensor.two"]));
    await tick();
    const narrower = {
      ...history(),
      start_time: new Date(start + 3600000).toISOString(),
      end_time: new Date(end - 3600000).toISOString(),
    };
    const b = requestCardData(ha, narrower);
    finish({ "sensor.one": [{ s: "unavailable", lu: start / 1000 }] });
    const [first, second] = await Promise.all([a, b]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(first["sensor.one"][0]).toEqual({
      s: "unavailable",
      lu: start / 1000,
    });
    expect(second["sensor.one"][0]).toEqual({
      s: "unavailable",
      lu: (start + 3600000) / 1000,
    });
  });

  it("does not reuse uncovered entities or later end times after dispatch", async () => {
    let finish!: (data: unknown) => void;
    const callWS = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue({});
    const ha = hass(callWS);
    const a = requestCardData(ha, history());
    await tick();
    const b = requestCardData(ha, history(["sensor.two"]));
    const c = requestCardData(ha, history(undefined, 4));
    await Promise.all([b, c]);
    finish({});
    await a;
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("bounds the total drift instead of chaining arbitrarily wider ranges", async () => {
    const callWS = jest.fn().mockResolvedValue({});
    const ha = hass(callWS);
    await Promise.all(
      [0, 900, 1800].map((offset) =>
        requestCardData(ha, history(undefined, offset)),
      ),
    );
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("does not combine different history windows or attribute requirements", async () => {
    const callWS = jest.fn().mockResolvedValue({});
    const ha = hass(callWS);
    await Promise.all([
      requestCardData(ha, history()),
      requestCardData(ha, {
        ...history(),
        end_time: new Date(end + 1001).toISOString(),
      }),
      requestCardData(ha, {
        ...history(),
        no_attributes: false,
        minimal_response: false,
      }),
      requestCardData(ha, { ...history(), include_start_time_state: false }),
      requestCardData(ha, { ...history(), significant_changes_only: true }),
    ]);
    expect(callWS).toHaveBeenCalledTimes(5);
  });

  it("does not adjust the boundaries of attribute history requests", async () => {
    const callWS = jest.fn().mockResolvedValue({});
    const ha = hass(callWS);
    await Promise.all(
      [0, 4].map((offset) =>
        requestCardData(ha, {
          ...history(undefined, offset),
          no_attributes: false,
          minimal_response: false,
        }),
      ),
    );
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("keeps connections isolated even when they use the same transport function", async () => {
    const callWS = jest.fn().mockResolvedValue({});
    await Promise.all([
      requestCardData(hass(callWS), history()),
      requestCardData(hass(callWS), history()),
    ]);
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("does not share mutable rows or nested attributes between cards", async () => {
    const original = { s: "1", lu: start / 1000, a: { nested: { value: 1 } } };
    const callWS = jest.fn().mockResolvedValue({ "sensor.one": [original] });
    const ha = hass(callWS);
    const [a, b] = await Promise.all([
      requestCardData(ha, history()),
      requestCardData(ha, history()),
    ]);
    expect(a).not.toBe(b);
    expect(a["sensor.one"][0]).not.toBe(b["sensor.one"][0]);
    const row = a["sensor.one"][0];
    if ("s" in row) {
      row.s = "2";
      (row.a!.nested as { value: number }).value = 2;
    }
    expect(b["sensor.one"][0]).toEqual(original);
    expect(original.a.nested.value).toBe(1);
  });

  it("does not retain completed responses", async () => {
    const callWS = jest.fn().mockResolvedValue({});
    const ha = hass(callWS);
    await requestCardData(ha, history());
    await requestCardData(ha, history());
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("rejects all consumers and retries after a failed request", async () => {
    const error = new Error("offline");
    const callWS = jest.fn().mockRejectedValueOnce(error).mockResolvedValue({});
    const ha = hass(callWS);
    const settled = await Promise.allSettled([
      requestCardData(ha, history()),
      requestCardData(ha, history()),
    ]);
    expect(settled).toEqual([
      { status: "rejected", reason: error },
      { status: "rejected", reason: error },
    ]);
    await expect(requestCardData(ha, history())).resolves.toEqual({});
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("does not strand queued groups when the transport throws synchronously", async () => {
    const callWS = jest
      .fn()
      .mockImplementationOnce(() => {
        throw Error("offline");
      })
      .mockResolvedValue({});
    const ha = hass(callWS);
    const settled = await Promise.allSettled([
      requestCardData(ha, history()),
      requestCardData(ha, { ...history(), no_attributes: false }),
    ]);
    expect(settled.map(({ status }) => status)).toEqual([
      "rejected",
      "fulfilled",
    ]);
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("batches statistics IDs but keeps periods, field sets and exact ranges separate", async () => {
    const callWS = jest.fn().mockResolvedValue({});
    const ha = hass(callWS);
    await Promise.all([
      requestCardData(ha, statistics()),
      requestCardData(ha, statistics(["sensor.two"])),
      requestCardData(ha, { ...statistics(), period: "5minute" }),
      requestCardData(ha, { ...statistics(), period: "day" }),
      requestCardData(ha, { ...statistics(), types: ["mean"] }),
      requestCardData(ha, {
        ...statistics(),
        start_time: new Date(start + 4).toISOString(),
      }),
    ]);
    expect(callWS).toHaveBeenCalledTimes(5);
    expect(callWS.mock.calls[0][0].statistic_ids).toEqual([
      "sensor.one",
      "sensor.two",
    ]);
  });

  it("canonicalizes field sets and leaves shared statistics independently mutable", async () => {
    const callWS = jest.fn().mockResolvedValue({
      "sensor.one": [{ start: new Date(start).toISOString(), mean: 4, max: 8 }],
    });
    const ha = hass(callWS);
    const [a, b] = await Promise.all([
      requestCardData(ha, { ...statistics(), types: ["mean", "max"] }),
      requestCardData(ha, { ...statistics(), types: ["max", "mean"] }),
    ]);
    a["sensor.one"][0].mean = 99;
    expect(b["sensor.one"][0].mean).toBe(4);
    expect(callWS).toHaveBeenCalledTimes(1);
  });

  it("integrates with separate card caches rather than merging their mutable arrays", async () => {
    const connection = {};
    const callWS = jest.fn(async ({ entity_ids }) =>
      Object.fromEntries(
        entity_ids.map((id: string) => [id, [{ s: "1", lu: start / 1000 }]]),
      ),
    );
    const a = new Cache(),
      b = new Cache();
    await Promise.all([
      a.fetch([start, end], { entity: "sensor.one" }, hass(callWS, connection)),
      b.fetch([start, end], { entity: "sensor.one" }, hass(callWS, connection)),
    ]);
    expect(callWS).toHaveBeenCalledTimes(1);
    a.getData({ entity: "sensor.one" }).xs.splice(0);
    expect(b.getData({ entity: "sensor.one" }).ys).toEqual(["1"]);
    a.clearCache();
    expect(b.getData({ entity: "sensor.one" }).ys).toEqual(["1"]);
  });

  it("integrates both statistics and state fetch paths", async () => {
    const callWS = jest.fn().mockResolvedValue({});
    const ha = hass(callWS);
    await Promise.all([
      fetchStatesBatch(
        ha,
        [{ entity: "sensor.one" }],
        [new Date(start), new Date(end)],
      ),
      fetchStatesBatch(
        ha,
        [{ entity: "sensor.two" }],
        [new Date(start), new Date(end)],
      ),
      fetchStatistics(
        ha,
        [{ entity: "sensor.one", statistic: "mean", period: "hour" }],
        [new Date(start), new Date(end)],
      ),
      fetchStatistics(
        ha,
        [{ entity: "sensor.two", statistic: "max", period: "hour" }],
        [new Date(start), new Date(end)],
      ),
    ]);
    expect(callWS).toHaveBeenCalledTimes(2);
  });
});

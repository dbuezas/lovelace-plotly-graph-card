import type { Mock } from "vitest";
import type { HomeAssistant } from "custom-card-helpers";
import {
  requestCardData,
  HistoryRequest,
  StatisticsRequest,
} from "./shared-requests";
import fetchStatistics from "./fetch-statistics";

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
const hass = (callWS: Mock, connection: object = {}): HomeAssistant =>
  ({ callWS, connection }) as unknown as HomeAssistant;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("shared card requests", () => {
  it("batches entity sets across HA state snapshots on the same connection", async () => {
    const callWS = vi.fn().mockResolvedValue({});
    const connection = {};
    const a = requestCardData(
      hass(callWS, connection),
      history(["sensor.one", "sensor.two"]),
    );
    await Promise.resolve();
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

  it("reuses an in-flight entity superset only for the same history window", async () => {
    let finish!: (data: unknown) => void;
    const callWS = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const ha = hass(callWS);
    const a = requestCardData(ha, history(["sensor.one", "sensor.two"]));
    await tick();
    const b = requestCardData(ha, history());
    const rows = [{ s: "unavailable", lu: start / 1000 }];
    finish({ "sensor.one": rows, "sensor.two": rows });
    const [first, second] = await Promise.all([a, b]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ "sensor.one": rows, "sensor.two": rows });
    expect(second).toEqual({ "sensor.one": rows });
  });

  it("does not reuse uncovered entities or later end times after dispatch", async () => {
    let finish!: (data: unknown) => void;
    const callWS = vi
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
    expect(callWS).toHaveBeenCalledTimes(3);
  });

  it("keeps even millisecond range differences and history options separate", async () => {
    const callWS = vi.fn().mockResolvedValue({});
    const ha = hass(callWS);
    await Promise.all([
      requestCardData(ha, history()),
      requestCardData(ha, {
        ...history(),
        end_time: new Date(end + 4).toISOString(),
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

  it("keeps connections isolated even when they use the same transport function", async () => {
    const callWS = vi.fn().mockResolvedValue({});
    await Promise.all([
      requestCardData(hass(callWS), history()),
      requestCardData(hass(callWS), history()),
    ]);
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("does not share mutable rows or nested attributes between cards", async () => {
    const original = { s: "1", lu: start / 1000, a: { nested: { value: 1 } } };
    const callWS = vi.fn().mockResolvedValue({ "sensor.one": [original] });
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
    const callWS = vi.fn().mockResolvedValue({});
    const ha = hass(callWS);
    await requestCardData(ha, history());
    await requestCardData(ha, history());
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("retries an invalid-entity batch per card so healthy cards still load", async () => {
    const error = { code: "invalid_entity_ids", message: "Invalid entity_ids" };
    const rows = [{ s: "1", lu: start / 1000 }];
    const callWS = vi.fn(async ({ entity_ids }: HistoryRequest) => {
      if (entity_ids.includes("sensor.my-typo")) throw error;
      return { "sensor.ok": rows };
    });
    const ha = hass(callWS);
    const settled = await Promise.allSettled([
      requestCardData(ha, history(["sensor.ok"])),
      requestCardData(ha, history(["sensor.my-typo"])),
    ]);
    expect(settled).toEqual([
      { status: "fulfilled", value: { "sensor.ok": rows } },
      { status: "rejected", reason: error },
    ]);
    expect(callWS.mock.calls.map(([request]) => request.entity_ids)).toEqual([
      ["sensor.ok", "sensor.my-typo"],
      ["sensor.ok"],
      ["sensor.my-typo"],
    ]);
  });

  it("rejects transport failures without extra retries and accepts the next request", async () => {
    const error = new Error("offline");
    const callWS = vi.fn().mockRejectedValueOnce(error).mockResolvedValue({});
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
    const callWS = vi
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

  it("batches the statistics fetch path but keeps periods and exact ranges separate", async () => {
    const callWS = vi.fn().mockResolvedValue({});
    const ha = hass(callWS);
    await Promise.all([
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
      requestCardData(ha, { ...statistics(), period: "5minute" }),
      requestCardData(ha, { ...statistics(), period: "day" }),
      requestCardData(ha, {
        ...statistics(),
        start_time: new Date(start + 4).toISOString(),
      }),
    ]);
    expect(callWS).toHaveBeenCalledTimes(4);
    expect(callWS.mock.calls[0][0].statistic_ids).toEqual([
      "sensor.one",
      "sensor.two",
    ]);
  });
});

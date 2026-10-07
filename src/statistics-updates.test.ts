import type { HomeAssistant } from "custom-card-helpers";
import type { StatisticPeriod } from "./recorder-types";
import { StatisticsUpdates } from "./statistics-updates";

const periods = (...values: StatisticPeriod[]) => new Set(values);
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function mockConnection() {
  const callbacks = new Map<string, () => void>();
  const unsubscribes = new Map<string, jest.Mock>();
  const subscribeEvents = jest.fn(
    async (callback: () => void, event: string) => {
      callbacks.set(event, callback);
      const unsubscribe = jest.fn();
      unsubscribes.set(event, unsubscribe);
      return unsubscribe;
    },
  );
  const connection = {
    subscribeEvents,
  } as unknown as HomeAssistant["connection"];
  return { connection, subscribeEvents, callbacks, unsubscribes };
}

describe("statistics update subscriptions", () => {
  it("subscribes to short-term updates only for 5minute data", async () => {
    const mock = mockConnection();
    const update = jest.fn();
    const subscriptions = new StatisticsUpdates(update);
    subscriptions.update(mock.connection, periods("5minute"));
    await flush();
    expect([...mock.callbacks.keys()]).toEqual([
      "recorder_5min_statistics_generated",
    ]);
    mock.callbacks.get("recorder_5min_statistics_generated")!();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("5minute");
    subscriptions.disconnect();
  });

  it("uses one hourly subscription for all long-term periods", async () => {
    const mock = mockConnection();
    const subscriptions = new StatisticsUpdates(jest.fn());
    subscriptions.update(
      mock.connection,
      periods("hour", "day", "week", "month"),
    );
    await flush();
    expect([...mock.callbacks.keys()]).toEqual([
      "recorder_hourly_statistics_generated",
    ]);
    subscriptions.disconnect();
  });

  it("does not duplicate subscriptions on repeated renders", async () => {
    const mock = mockConnection();
    const subscriptions = new StatisticsUpdates(jest.fn());
    subscriptions.update(mock.connection, periods("5minute", "hour"));
    subscriptions.update(mock.connection, periods("5minute", "day"));
    await flush();
    expect(mock.subscribeEvents).toHaveBeenCalledTimes(2);
    subscriptions.disconnect();
    expect(
      [...mock.unsubscribes.values()].every(
        (unsubscribe) => unsubscribe.mock.calls.length === 1,
      ),
    ).toBe(true);
  });

  it("removes obsolete periods and ignores their old callbacks", async () => {
    const mock = mockConnection();
    const update = jest.fn();
    const subscriptions = new StatisticsUpdates(update);
    subscriptions.update(mock.connection, periods("5minute"));
    await flush();
    subscriptions.update(mock.connection, periods("day"));
    await flush();
    expect(
      mock.unsubscribes.get("recorder_5min_statistics_generated"),
    ).toHaveBeenCalledTimes(1);
    mock.callbacks.get("recorder_5min_statistics_generated")!();
    expect(update).not.toHaveBeenCalled();
    mock.callbacks.get("recorder_hourly_statistics_generated")!();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("hour");
    subscriptions.update(mock.connection, periods());
    expect(
      mock.unsubscribes.get("recorder_hourly_statistics_generated"),
    ).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes if the card disconnects before subscribing completes", async () => {
    const mock = mockConnection();
    const update = jest.fn();
    const subscriptions = new StatisticsUpdates(update);
    subscriptions.update(mock.connection, periods("5minute"));
    subscriptions.disconnect();
    await flush();
    expect(
      mock.unsubscribes.get("recorder_5min_statistics_generated"),
    ).toHaveBeenCalledTimes(1);
    mock.callbacks.get("recorder_5min_statistics_generated")!();
    expect(update).not.toHaveBeenCalled();
  });

  it("replaces subscriptions when the HA connection changes", async () => {
    const first = mockConnection();
    const second = mockConnection();
    const update = jest.fn();
    const subscriptions = new StatisticsUpdates(update);
    subscriptions.update(first.connection, periods("hour"));
    subscriptions.update(second.connection, periods("hour"));
    await flush();
    expect(
      first.unsubscribes.get("recorder_hourly_statistics_generated"),
    ).toHaveBeenCalledTimes(1);
    first.callbacks.get("recorder_hourly_statistics_generated")!();
    second.callbacks.get("recorder_hourly_statistics_generated")!();
    expect(update).toHaveBeenCalledTimes(1);
    subscriptions.disconnect();
  });

  it("does not require a connection or subscribe for history-only cards", () => {
    const mock = mockConnection();
    const subscriptions = new StatisticsUpdates(jest.fn());
    subscriptions.update(undefined, periods("hour"));
    subscriptions.update(mock.connection, periods());
    expect(mock.subscribeEvents).not.toHaveBeenCalled();
  });

  it("handles rejected subscriptions without an unhandled rejection", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const mock = mockConnection();
      mock.subscribeEvents.mockRejectedValue(new Error("offline"));
      const subscriptions = new StatisticsUpdates(jest.fn());
      subscriptions.update(mock.connection, periods("hour"));
      await flush();
      expect(warning).toHaveBeenCalledTimes(1);
      subscriptions.disconnect();
    } finally {
      warning.mockRestore();
    }
  });
});

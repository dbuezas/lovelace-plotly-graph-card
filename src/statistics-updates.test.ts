import type { HomeAssistant } from "custom-card-helpers";
import type { StatisticPeriod } from "./recorder-types";
import { StatisticsUpdates } from "./statistics-updates";

const SHORT = "recorder_5min_statistics_generated";
const HOURLY = "recorder_hourly_statistics_generated";
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
  it.each([
    [["5minute"], [SHORT], ["5minute"]],
    [["hour", "day", "week", "month"], [HOURLY], ["hour"]],
    [
      ["5minute", "day"],
      [SHORT, HOURLY],
      ["5minute", "hour"],
    ],
    [[], [], []],
  ] as [StatisticPeriod[], string[], string[]][])(
    "%j subscribes to %j and reports %j",
    async (live, events, reported) => {
      const mock = mockConnection();
      const update = jest.fn();
      new StatisticsUpdates(update).update(mock.connection, periods(...live));
      await flush();
      expect([...mock.callbacks.keys()]).toEqual(events);
      mock.callbacks.forEach((callback) => callback());
      expect(update.mock.calls.flat()).toEqual(reported);
    },
  );

  it("does not duplicate subscriptions on repeated renders", async () => {
    const mock = mockConnection();
    const subscriptions = new StatisticsUpdates(jest.fn());
    subscriptions.update(mock.connection, periods("5minute", "hour"));
    subscriptions.update(mock.connection, periods("5minute", "day"));
    await flush();
    expect(mock.subscribeEvents).toHaveBeenCalledTimes(2);
  });

  it("unsubscribes from periods that are no longer shown", async () => {
    const mock = mockConnection();
    const update = jest.fn();
    const subscriptions = new StatisticsUpdates(update);
    subscriptions.update(mock.connection, periods("5minute"));
    await flush();
    subscriptions.update(mock.connection, periods("day"));
    expect(mock.unsubscribes.get(SHORT)).toHaveBeenCalledTimes(1);
    mock.callbacks.get(SHORT)!();
    expect(update).not.toHaveBeenCalled();
  });

  it("unsubscribes if the card disconnects before subscribing completes", async () => {
    const mock = mockConnection();
    const update = jest.fn();
    const subscriptions = new StatisticsUpdates(update);
    subscriptions.update(mock.connection, periods("5minute"));
    subscriptions.disconnect();
    await flush();
    expect(mock.unsubscribes.get(SHORT)).toHaveBeenCalledTimes(1);
    mock.callbacks.get(SHORT)!();
    expect(update).not.toHaveBeenCalled();
  });

  it("moves subscriptions to a new HA connection", async () => {
    const first = mockConnection();
    const second = mockConnection();
    const update = jest.fn();
    const subscriptions = new StatisticsUpdates(update);
    subscriptions.update(first.connection, periods("hour"));
    subscriptions.update(second.connection, periods("hour"));
    await flush();
    expect(first.unsubscribes.get(HOURLY)).toHaveBeenCalledTimes(1);
    first.callbacks.get(HOURLY)!();
    second.callbacks.get(HOURLY)!();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("warns instead of throwing when subscribing fails", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    const mock = mockConnection();
    mock.subscribeEvents.mockRejectedValue(new Error("offline"));
    new StatisticsUpdates(jest.fn()).update(mock.connection, periods("hour"));
    await flush();
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });
});

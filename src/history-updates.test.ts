import type { HomeAssistant } from "custom-card-helpers";
import { HistoryUpdates } from "./history-updates";

function fixture() {
  const callbacks: ((message: any) => void)[] = [];
  const ready = new Set<() => void>();
  const unsubscribes: jest.Mock[] = [];
  const subscribeMessage = jest.fn(
    async (
      callback: (message: any) => void,
      _request: unknown,
      _options?: unknown,
    ) => {
      callbacks.push(callback);
      const unsubscribe = jest.fn();
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    },
  );
  const connection = {
    subscribeMessage,
    addEventListener: jest.fn((_: string, callback: () => void) =>
      ready.add(callback),
    ),
    removeEventListener: jest.fn((_: string, callback: () => void) =>
      ready.delete(callback),
    ),
  } as unknown as HomeAssistant["connection"];
  const update = jest.fn();
  const stream = new HistoryUpdates(update);
  return {
    stream,
    update,
    callbacks,
    ready,
    connection,
    subscribeMessage,
    unsubscribes,
  };
}

describe("history update streams", () => {
  it("shares one stream across entities and retains every state in a burst", async () => {
    const f = fixture();
    f.stream.update(
      f.connection,
      ["sensor.b", "sensor.a", "sensor.a"],
      false,
      () => 10000,
    );
    f.stream.update(f.connection, ["sensor.a", "sensor.b"], false, () => 20000);
    await Promise.resolve();
    expect(f.subscribeMessage).toHaveBeenCalledTimes(1);
    expect(f.subscribeMessage.mock.calls[0][1]).toEqual({
      type: "history/stream",
      start_time: new Date(9999).toISOString(),
      entity_ids: ["sensor.a", "sensor.b"],
      include_start_time_state: false,
      significant_changes_only: false,
      minimal_response: true,
      no_attributes: true,
    });
    const states = {
      "sensor.a": [
        { s: "1", lu: 10 },
        { s: "2", lu: 11 },
      ],
    };
    f.callbacks[0]({ states });
    expect(f.update).toHaveBeenCalledWith(states, 10000);
    f.stream.disconnect();
    f.callbacks[0]({ states });
    expect(f.update).toHaveBeenCalledTimes(1);
    expect(f.ready.size).toBe(0);
  });

  it("restarts with the latest known timestamp on reconnect and ignores the old stream", async () => {
    const f = fixture();
    let start = 10000;
    f.stream.update(f.connection, ["sensor.a"], true, () => start);
    await Promise.resolve();
    start = 20000;
    for (const ready of f.ready) ready();
    await Promise.resolve();
    expect(f.subscribeMessage.mock.calls[1][1]).toMatchObject({
      start_time: new Date(19999).toISOString(),
      minimal_response: false,
      no_attributes: false,
    });
    expect(f.subscribeMessage.mock.calls[1][2]).toEqual({ resubscribe: false });
    expect(f.unsubscribes[0]).not.toHaveBeenCalled();
    f.callbacks[0]({ states: {} });
    f.callbacks[1]({ states: {} });
    expect(f.update).toHaveBeenCalledTimes(1);
    f.stream.disconnect();
  });

  it("does not replay a busy entity's whole window because another entity is quiet", async () => {
    const f = fixture();
    const now = 100000000;
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    try {
      f.stream.update(
        f.connection,
        ["sensor.busy", "binary_sensor.quiet"],
        false,
        (id) => (id === "sensor.busy" ? now - 1000 : now - 24 * 3600000),
      );
      expect(
        f.subscribeMessage.mock.calls.map(([, request]) => request),
      ).toEqual([
        expect.objectContaining({
          entity_ids: ["binary_sensor.quiet"],
          start_time: new Date(now - 24 * 3600000 - 1).toISOString(),
        }),
        expect.objectContaining({
          entity_ids: ["sensor.busy"],
          start_time: new Date(now - 1001).toISOString(),
        }),
      ]);
    } finally {
      f.stream.disconnect();
      clock.mockRestore();
    }
  });

  it("does not unsubscribe a pending old-socket stream after reconnect", async () => {
    const f = fixture();
    const unsubscribe = jest.fn();
    let resolve!: (value: jest.Mock) => void;
    f.subscribeMessage.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    f.stream.update(f.connection, ["sensor.a"], false, () => 10000);
    for (const ready of f.ready) ready();
    resolve(unsubscribe);
    await Promise.resolve();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(f.stream.has("sensor.a")).toBe(true);
    f.stream.disconnect();
  });

  it("cleans up pending subscriptions when the entity set or connection changes", async () => {
    const f = fixture();
    f.stream.update(f.connection, ["sensor.a"], false, () => 10000);
    f.stream.update(f.connection, ["sensor.b"], true, () => 10000);
    f.stream.disconnect();
    await Promise.resolve();
    expect(
      f.unsubscribes.every(
        (unsubscribe) => unsubscribe.mock.calls.length === 1,
      ),
    ).toBe(true);
    f.callbacks.forEach((callback) => callback({ states: {} }));
    expect(f.update).not.toHaveBeenCalled();
    const next = fixture();
    f.stream.update(next.connection, ["sensor.c"], false, () => 10000);
    expect(next.subscribeMessage).toHaveBeenCalledTimes(1);
    f.stream.disconnect();
  });

  it("falls back after a failed stream and retries only when the connection is ready", async () => {
    const f = fixture();
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      f.subscribeMessage.mockRejectedValueOnce(new Error("offline"));
      f.stream.update(f.connection, ["sensor.a"], false, () => 10000);
      await Promise.resolve();
      await Promise.resolve();
      expect(f.stream.has("sensor.a")).toBe(false);
      for (let index = 0; index < 50; index++)
        f.stream.update(f.connection, ["sensor.a"], false, () => 10000);
      await Promise.resolve();
      expect(f.subscribeMessage).toHaveBeenCalledTimes(1);
      expect(f.stream.has("sensor.a")).toBe(false);
      for (const ready of f.ready) ready();
      await Promise.resolve();
      expect(f.subscribeMessage).toHaveBeenCalledTimes(2);
      expect(f.stream.has("sensor.a")).toBe(true);
      f.stream.update(f.connection, [], false, () => 10000);
      expect(f.stream.has("sensor.a")).toBe(false);
      expect(warning).toHaveBeenCalledTimes(1);
    } finally {
      f.stream.disconnect();
      warning.mockRestore();
    }
  });
});

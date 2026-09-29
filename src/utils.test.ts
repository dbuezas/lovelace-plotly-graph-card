import { debounce } from "./utils";

async function advance(ms: number) {
  await new Promise(setImmediate);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    jest.advanceTimersByTime(1);
    await new Promise(setImmediate);
  }
}

describe("debounce", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["setImmediate"] });
    global.requestAnimationFrame = jest.fn(
      (callback) =>
        setTimeout(() => callback(Date.now()), 16) as unknown as number,
    );
    global.cancelAnimationFrame = jest.fn((frame) => clearTimeout(frame));
  });
  afterEach(() => {
    jest.useRealTimers();
    delete (global as Partial<typeof globalThis>).requestAnimationFrame;
    delete (global as Partial<typeof globalThis>).cancelAnimationFrame;
  });

  it("waits once for a burst and settles every caller", async () => {
    const render = jest.fn(async () => {});
    const update = debounce(render);
    const calls = Array.from({ length: 20 }, () => update(500));
    await advance(515);
    expect(render).not.toHaveBeenCalled();
    await advance(1);
    await Promise.all(calls);
    expect(render).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("cancels an active delay when an immediate update arrives", async () => {
    const render = jest.fn(async () => {});
    const update = debounce(render);
    const first = update(500);
    await advance(100);
    const second = update();
    await advance(16);
    await Promise.all([first, second]);
    expect(render).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("uses the latest request's delay", async () => {
    const render = jest.fn(async () => {});
    const update = debounce(render);
    const first = update(500);
    await advance(100);
    const second = update(200);
    await advance(215);
    expect(render).not.toHaveBeenCalled();
    await advance(1);
    await Promise.all([first, second]);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending animation frame", async () => {
    const render = jest.fn(async () => {});
    const update = debounce(render);
    const first = update();
    await advance(0);
    const second = update();
    await advance(16);
    await Promise.all([first, second]);
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("does not interrupt or overlap an active render", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const render = jest
      .fn()
      .mockImplementationOnce(() => gate)
      .mockResolvedValue(undefined);
    const update = debounce(render);
    const first = update();
    await advance(16);
    const queued = Array.from({ length: 20 }, () => update(500));
    await advance(2000);
    expect(render).toHaveBeenCalledTimes(1);
    finish();
    await advance(516);
    await Promise.all([first, ...queued]);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    "propagates failure and allows recovery (async: %s)",
    async (asyncFailure) => {
      const failure = new Error("render failed");
      const render = jest
        .fn()
        .mockImplementationOnce(() => {
          if (asyncFailure) return Promise.reject(failure);
          throw failure;
        })
        .mockResolvedValue(undefined);
      const update = debounce(render);
      const rejected = expect(update()).rejects.toBe(failure);
      await advance(16);
      await rejected;
      const recovered = update();
      await advance(16);
      await recovered;
      expect(render).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps separate queues independent", async () => {
    const first = jest.fn(async () => {});
    const second = jest.fn(async () => {});
    const calls = [debounce(first)(500), debounce(second)(100)];
    await advance(116);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    await advance(400);
    await Promise.all(calls);
    expect(first).toHaveBeenCalledTimes(1);
  });
});

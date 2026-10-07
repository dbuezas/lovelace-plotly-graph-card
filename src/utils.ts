export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
export function getIsPureObject(val: any) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

// A delay function is called once the previous run has finished
export type Delay = number | (() => number);
export function debounce(func: () => Promise<void>) {
  let lastRunningPromise = Promise.resolve();
  let cancelWaiting = () => {};
  return (delay?: Delay) => {
    cancelWaiting();
    let cancelled = false;
    let cancelWait = () => {};
    cancelWaiting = () => {
      cancelled = true;
      cancelWait();
    };
    const result = lastRunningPromise
      .catch(() => {})
      .then(async () => {
        if (cancelled) return;
        const ms = typeof delay === "function" ? delay() : delay;
        if (ms) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, ms);
            cancelWait = () => {
              clearTimeout(timer);
              resolve();
            };
          });
        }
        if (cancelled) return;
        await new Promise<void>((resolve) => {
          const frame = requestAnimationFrame(() => {
            cancelWait = () => {};
            resolve();
          });
          cancelWait = () => {
            cancelAnimationFrame(frame);
            resolve();
          };
        });
        if (cancelled) return;
        // Only waiting work is cancelled; an active render must finish first.
        await func();
      });
    lastRunningPromise = result;
    return result;
  };
}

// Live updates render 100 ms after the first change, so a burst lands in one
// render, and at least 500 ms after the last render ended. Neither deadline
// moves with later changes, so a stream can't postpone the render.
export function liveThrottle() {
  let firstChange: number | undefined;
  let lastEnd = -Infinity;
  return {
    // A delay for debounce: it is read once a running render has finished
    change(): Delay {
      firstChange ??= performance.now();
      return () =>
        Math.max((firstChange ?? 0) + 100, lastEnd + 500) - performance.now();
    },
    renderStarted() {
      firstChange = undefined;
    },
    renderEnded() {
      lastEnd = performance.now();
    },
  };
}

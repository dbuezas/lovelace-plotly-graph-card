export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
export function getIsPureObject(val: any) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function debounce(func: (delay?: number) => Promise<void>) {
  let lastRunningPromise = Promise.resolve();
  let cancelWaiting = () => {};
  return (delay?: number) => {
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
        if (delay) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, delay);
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

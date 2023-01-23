export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
export function getIsPureObject(val: any) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

// todo: readability
export function debounce(func: () => Promise<void>) {
  let lastRunningPromise = Promise.resolve();
  let waiting = {
    cancelled: false,
  };
  return async () => {
    waiting.cancelled = true;
    const me = {
      cancelled: false,
    };
    waiting = me;
    await lastRunningPromise;
    if (me.cancelled) return;
    setTimeout(async () => {
      if (me.cancelled) return;
      lastRunningPromise = func();
    });
  };
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
export function getIsPureObject(val: any) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function debounce(func: (...args) => Promise<void>) {
  let lastRunningPromise = Promise.resolve();
  let waiting = {
    cancelled: false,
  };
  return () => {
    waiting.cancelled = true;
    const me = {
      cancelled: false,
    };
    waiting = me;
    return (lastRunningPromise = lastRunningPromise.then(
      () =>
        new Promise((resolve) => {
          setTimeout(async () => {
            if (me.cancelled) resolve;
            resolve(func());
          });
        })
    ));
  };
}

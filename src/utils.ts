export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
export function getIsPureObject(val: any) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function debounce(func: (delay?: number) => Promise<void>) {
  let lastRunningPromise = Promise.resolve();
  let waiting = {
    cancelled: false,
  };
  return (delay?: number) => {
    waiting.cancelled = true;
    const me = {
      cancelled: false,
    };
    waiting = me;
    return (lastRunningPromise = lastRunningPromise
      .catch(() => {})
      .then(
        () =>
          new Promise(async (resolve) => {
            if (delay) {
              await sleep(delay);
            }
            requestAnimationFrame(async () => {
              if (me.cancelled) resolve();
              else resolve(func());
            });
          })
      ));
  };
}

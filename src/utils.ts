export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
export function getIsPureObject(val: any) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}
export class Deferred<R extends any> {
  resolve: (value: R | PromiseLike<R>) => void = () => {};
  reject = () => {};
  promise: Promise<R>;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
export function debounce<F extends (...args: Parameters<F>) => any>(
  func: F
): (...args: Parameters<F>) => Promise<ReturnType<F>> {
  let timeout: number;
  let deferred = new Deferred<ReturnType<F>>();
  return (...args: Parameters<F>): Promise<ReturnType<F>> => {
    const oldDeferred = deferred;
    deferred = new Deferred<ReturnType<F>>();
    cancelAnimationFrame(timeout);
    timeout = requestAnimationFrame(async () => {
      const r = await func(...args);
      deferred.resolve(r);
      oldDeferred.resolve(r);
    });
    return deferred.promise;
  };
}

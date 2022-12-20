import { Datum } from "plotly.js";
import { linearRegressionLine, linearRegression } from "simple-statistics";
import { timeUnits } from "../duration/duration";

const castFloat = (y: any) => parseFloat(y);
export const removeMissing = (ys: Datum[], xs: Datum[]) => ({
  ys: ys.map(castFloat).filter(Number.isFinite),
  xs: xs
    .filter((_, i) => Number.isFinite(castFloat(ys[i])))
    .map((x) => new Date(x as any)),
});
export default {
  offset:
    (val: number) =>
    (ys: number[], ..._args) =>
      ys.map((y) => y + val),
  multiply: (val: number) => (ys: number[]) => ys.map((y) => y * val),
  calibrate_linear: (obj: Record<number, number>) => (ys: number[]) => {
    const map = linearRegressionLine(
      linearRegression(Object.entries(obj).map(([from, to]) => [+from, to]))
    );
    return ys.map(map);
  },
  accumulate: () => (ys: number[]) => ys.reduce((acc, y) => y + acc, 0),
  derivate:
    (unit: keyof typeof timeUnits = "h") =>
    (ys, xs, { unit_of_measurement }) => {
      let last = {
        x: +xs[0],
        y: ys[0],
      };
      const timeUnit = timeUnits[unit];
      const r = {
        y: [] as number[],
        x: [] as Datum[],
      };
      for (let i = 1; i < ys.length; i++) {
        const x = +xs[i];
        const y = ys[i];
        const dateDelta = (+x - last.x) / timeUnit;
        const yDelta = (y - last.y) / dateDelta;
        last = { x, y };
        r.x.push(x);
        r.y.push(yDelta);
      }
      return {
        unit_of_measurement: `${unit_of_measurement}/${unit}`,
        x: r.x,
        y: r.y,
      };
    },
  integrate:
    (unit: keyof typeof timeUnits = "h") =>
    (ys, xs, { unit_of_measurement }) => {
      let accumulator = 0;
      let last = {
        x: xs[0],
        y: 0,
      };
      const timeUnit = timeUnits[unit];
      return {
        unit_of_measurement: `${unit_of_measurement}x${unit}`,
        y: ys.map((y, index) => {
          const x = xs[index];
          const dateDelta = (x - last.x) / timeUnit;
          accumulator += last.y * dateDelta;
          last = { x, y };
          return accumulator;
        }),
      };
    },
  sliding_window_moving_average:
    ({ alpha = 0.1 }) =>
    (ys) => {
      let last = ys[0];
      return {
        y: ys.map((y) => (last = last * (1 - alpha) + y * alpha)),
      };
    },
  math: (fnStr: string) => {
    const fn = window.eval(`(y)=>${fnStr}`);
    return (ys: number[]) => ys.map(fn);
  },
  fn: (fnStr: string) => window.eval(fnStr),
  /*
  # Example filters:
  filters:
    - offset: 2.0
    - multiply: 1.2
    - calibrate_linear:
        - 0.0 -> 0.0
        - 40.0 -> 45.0
        - 100.0 -> 102.5
    - median:
        window_size: 5
    - sliding_window_moving_average:
        window_size: 15
    -     const timeUnit = timeUnits[unit];
  :
        alpha: 0.1
    - lambda: return x * (9.0/5.0) + 32.0;
  
  */
};

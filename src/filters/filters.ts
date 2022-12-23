import { Datum } from "plotly.js";
import { linearRegressionLine, linearRegression } from "simple-statistics";
import { timeUnits } from "../duration/duration";
import { CachedEntity } from "../types";

const castFloat = (y: any) => parseFloat(y);
const myEval = typeof window != "undefined" ? window.eval : global.eval;
export const prepareData = ({
  ys,
  xs,
  ...rest
}: {
  ys: Datum[];
  xs: Datum[];
  attributes: Record<string, string>;
  vars: Record<any, any>;
  history: CachedEntity[];
}) =>
  ({
    ...rest,
    ys: ys.map(castFloat).filter(Number.isFinite),
    xs: xs
      .filter((_, i) => Number.isFinite(castFloat(ys[i])))
      .map((x) => new Date(x as any)),
  } as Trace);
type Trace = {
  xs: Date[];
  ys: number[];
  attributes: Record<string, string>;
  vars: Record<any, any>;
};
export type FilterFn = (p: Trace) => Trace;

const filters = {
  offset:
    (val: number) =>
    ({ ys, ...rest }) => ({
      ...rest,
      ys: ys.map((y) => y + val),
    }),
  multiply:
    (val: number) =>
    ({ ys, ...rest }) => ({
      ...rest,
      ys: ys.map((y) => y * val),
    }),
  calibrate_linear:
    (mapping: `${number} -> ${number}`[]) =>
    ({ ys, ...rest }) => {
      const map = linearRegressionLine(
        linearRegression(mapping.map((str) => str.split("->").map(parseFloat)))
      );
      return { ...rest, ys: ys.map(map) };
    },
  derivate:
    (unit: keyof typeof timeUnits = "h") =>
    ({ xs, ys, attributes, ...rest }) => ({
      ...rest,
      attributes: {
        unit_of_measurement: `${attributes.unit_of_measurement}/${unit}`,
      },
      xs: xs.slice(1),
      ys: ys
        .map((_y, i) => {
          const dateDelta = (+xs[i] - +xs[i - 1]) / timeUnits[unit];
          const yDelta = (ys[i] - ys[i - 1]) / dateDelta;
          return yDelta;
        })
        .slice(1),
    }),
  integrate:
    (unit: keyof typeof timeUnits = "h") =>
    ({ xs, ys, attributes, ...rest }) => {
      let yAcc = 0;
      return {
        ...rest,
        attributes: {
          unit_of_measurement: `${attributes.unit_of_measurement}*${unit}`,
        },
        xs: xs.slice(1),
        ys: ys
          .map((_y, i) => {
            if (i === 0) return 0;
            const dateDelta = (+xs[i] - +xs[i - 1]) / timeUnits[unit];
            yAcc += ys[i] * dateDelta;
            return yAcc;
          })
          .slice(1),
      };
    },
  sliding_window_moving_average:
    ({ window_size = 10, extended = false, centered = true } = {}) =>
    ({ xs, ys, attributes, ...rest }) => {
      const ys2: number[] = [];
      const xs2: Date[] = [];
      let acc = {
        y: 0,
        count: 0,
        x: 0,
      };
      for (let i = 0; i < ys.length + window_size; i++) {
        if (i < ys.length) {
          acc.x += +xs[i];
          acc.y += ys[i];
          acc.count++;
        }
        if (i >= window_size) {
          acc.x -= +xs[i - window_size];
          acc.y -= ys[i - window_size];
          acc.count--;
        }
        if ((i >= window_size && i < ys.length) || extended) {
          if (centered) xs2.push(new Date(acc.x / acc.count));
          else xs2.push(xs[i]);
          ys2.push(acc.y / acc.count);
        }
      }
      return { ys: ys2, xs: xs2, attributes, ...rest };
    },
  median:
    ({ window_size = 10, extended = false, centered = true } = {}) =>
    ({ xs, ys, attributes, ...rest }) => {
      const ys2: number[] = [];
      const xs2: Date[] = [];
      let acc = {
        ys: [] as number[],
        x: 0,
      };
      for (let i = 0; i < ys.length + window_size; i++) {
        if (i < ys.length) {
          acc.x += +xs[i];
          acc.ys.push(ys[i]);
        }
        if (i >= window_size) {
          acc.x -= +xs[i - window_size];
          acc.ys.shift();
        }
        if ((i >= window_size && i < ys.length) || extended) {
          if (centered) xs2.push(new Date(acc.x / acc.ys.length));
          else xs2.push(xs[i]);
          const mid1 = Math.floor(acc.ys.length / 2);
          const mid2 = Math.ceil(acc.ys.length / 2);
          ys2.push((acc.ys[mid1] + acc.ys[mid2]) / 2);
        }
      }
      return { ys: ys2, xs: xs2, attributes, ...rest };
    },
  exponential_moving_average:
    ({ alpha = 0.1 } = {}) =>
    ({ ys, ...rest }) => {
      let last = ys[0];
      return {
        ...rest,
        ys: ys.map((y) => (last = last * (1 - alpha) + y * alpha)),
      };
    },
  map_y: (fnStr: string) => {
    const fn = myEval(`(x,y)=>${fnStr}`);
    return ({ xs, ys, ...rest }) => ({
      ...rest,
      xs,
      ys: ys.map((_, i) => fn(xs[i], ys[i])),
    });
  },
  map_x: (fnStr: string) => {
    const fn = myEval(`(x,y)=>${fnStr}`);
    return ({ xs, ys, ...rest }) => ({
      ...rest,
      ys,
      xs: xs.map((_, i) => fn(xs[i], ys[i])),
    });
  },
  set_var:
    (var_name: string) =>
    ({ vars, ...rest }) => ({ vars: { ...vars, [var_name]: rest }, ...rest }),
  get_var:
    (var_name: string) =>
    ({ vars }) => ({ vars, ...vars[var_name] }),
  fn: (fnStr: string) => myEval(fnStr),
  filter: (fnStr: string) => {
    const fn = myEval(`(x,y)=>${fnStr}`);
    return ({ ys, xs, ...rest }) => {
      const xs2: Date[] = [];
      const ys2: number[] = [];
      for (let i = 0; i < ys.length; i++) {
        const x = xs[i];
        const y = ys[i];
        if (fn(x, y)) {
          xs2.push(x);
          ys2.push(y);
        }
      }
      return { ...rest, ys: ys2, xs: xs2 };
    };
  },
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
} satisfies Record<string, (...args: any[]) => FilterFn>;
export default filters;

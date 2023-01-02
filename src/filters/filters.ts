import { Datum } from "plotly.js";
import { linearRegressionLine, linearRegression } from "simple-statistics";
import { timeUnits } from "../duration/duration";
import { StatisticValue } from "../recorder-types";
import { HassEntity, YValue } from "../types";

const castFloat = (y: any) => parseFloat(y);
const myEval = typeof window != "undefined" ? window.eval : global.eval;

type FilterData = {
  xs: Date[];
  ys: YValue[];
  states: HassEntity[];
  statistics: StatisticValue[];
  meta: HassEntity["attributes"];
  vars: Record<any, any>;
};
export type FilterFn = (p: FilterData) => Partial<FilterData>;

const mapNumbers = (ys: YValue[], fn: (y: number, i: number) => number) =>
  ys.map((y, i) => {
    const n = castFloat(y);
    if (Number.isNaN(n)) return y;
    return fn(n, i);
  });

/**
 * Removes from all params the indexes for which ys is not numeric, and parses ys to numbers.
 * WARNING: when used inside a filter, it is important to return all arrays. Otherwise the lengths
 * between say ys and states won't be consistent
 */
const force_numeric: (p: FilterData) => { ys: number[] } & FilterData = ({
  xs,
  ys: ys2,
  states,
  statistics,
  ...rest
}) => {
  const ys = ys2.map((y) => castFloat(y));
  const mask = ys.map((y) => !isNaN(y));
  return {
    ys: ys.filter((_, i) => mask[i]),
    xs: xs.filter((_, i) => mask[i]),
    states: states.filter((_, i) => mask[i]),
    statistics: statistics.filter((_, i) => mask[i]),
    ...rest,
  };
};

const filters = {
  force_numeric: () => force_numeric,
  add:
    (val: number) =>
    ({ ys }) => ({
      ys: mapNumbers(ys, (y) => y + val),
    }),
  multiply:
    (val: number) =>
    ({ ys }) => ({
      ys: mapNumbers(ys, (y) => y * val),
    }),
  calibrate_linear:
    (mappingStr: `${number} -> ${number}`[]) =>
    ({ ys }) => {
      const mapping = mappingStr.map((str) => str.split("->").map(parseFloat));
      const mapper = linearRegressionLine(linearRegression(mapping));
      return {
        ys: mapNumbers(ys, mapper),
      };
    },
  derivate:
    (unit: keyof typeof timeUnits = "h") =>
    ({ xs, ys, meta }) => {
      const last = {
        x: +xs[0],
        y: NaN,
      };
      return {
        meta: {
          unit_of_measurement: `${meta.unit_of_measurement}/${unit}`,
        },
        xs,
        ys: mapNumbers(ys, (y, i) => {
          const x = +xs[i];
          const dateDelta = (x - last.x) / timeUnits[unit];
          const yDelta = (y - last.y) / dateDelta;
          last.y = y;
          last.x = x;
          return yDelta;
        }),
      };
    },
  integrate:
    (unit: keyof typeof timeUnits = "h") =>
    ({ xs, ys, meta }) => {
      let yAcc = 0;
      let last = {
        x: NaN,
      };
      return {
        meta: {
          unit_of_measurement: `${meta.unit_of_measurement}*${unit}`,
        },
        xs: xs,
        ys: mapNumbers(ys, (y, i) => {
          const x = +xs[i];
          const dateDelta = (x - last.x) / timeUnits[unit];
          const isFirst = isNaN(last.x);
          last.x = x;
          if (isFirst) return NaN;
          yAcc += y * dateDelta;
          return yAcc;
        }),
      };
    },
  sliding_window_moving_average:
    ({ window_size = 10, extended = false, centered = true } = {}) =>
    (params) => {
      const { xs, ys, ...rest } = force_numeric(params);
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
      return { xs, ys, ...rest };
    },
  median:
    ({ window_size = 10, extended = false, centered = true } = {}) =>
    (params) => {
      const { xs, ys, ...rest } = force_numeric(params);
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
      return { ys: ys2, xs: xs2, ...rest };
    },
  exponential_moving_average:
    ({ alpha = 0.1 } = {}) =>
    (params) => {
      const { ys, ...rest } = force_numeric(params);
      let last = ys[0];
      return {
        ys: ys.map((y) => (last = last * (1 - alpha) + y * alpha)),
        ...rest,
      };
    },
  map_y_numbers: (fnStr: string) => {
    const fn = myEval(`(i, x, y, state, statistic, vars) => ${fnStr}`);
    return ({ xs, ys, states, statistics, vars }) => ({
      xs,
      ys: mapNumbers(ys, (y, i) =>
        fn(i, xs[i], y, states[i], statistics[i], vars)
      ),
    });
  },
  map_y: (fnStr: string) => {
    const fn = myEval(`(i, x, y, state, statistic) => ${fnStr}`);
    return ({ xs, ys, states, statistics, vars }) => ({
      xs,
      ys: ys.map((_, i) => fn(i, xs[i], ys[i], states[i], statistics[i], vars)),
    });
  },
  map_x: (fnStr: string) => {
    const fn = myEval(`(i, x, y, state, statistic, vars) => ${fnStr}`);
    return ({ xs, ys, states, statistics, vars }) => ({
      ys,
      xs: xs.map((_, i) => fn(i, xs[i], ys[i], states[i], statistics[i], vars)),
    });
  },
  store_var:
    (var_name: string) =>
    ({ vars, ...rest }) => ({ vars: { ...vars, [var_name]: rest } }),
  /*
    example: map("({xs, ys, states, statistics }) => ({xs: ys})")
  */
  map: (fnStr: string) => myEval(fnStr),
  filter: (fnStr: string) => {
    const fn = myEval(`(i, x, y, state, statistic, vars) => ${fnStr}`);
    return ({ xs, ys, states, statistics, vars }) => {
      const mask = ys.map((_, i) =>
        fn(i, xs[i], ys[i], states[i], statistics[i], vars)
      );
      return {
        ys: ys.filter((_, i) => mask[i]),
        xs: xs.filter((_, i) => mask[i]),
        states: states.filter((_, i) => mask[i]),
        statistics: statistics.filter((_, i) => mask[i]),
      };
    };
  },
} satisfies Record<string, (...args: any[]) => FilterFn>;
export default filters;

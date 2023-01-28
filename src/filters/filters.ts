import { HomeAssistant } from "custom-card-helpers";
import { linearRegressionLine, linearRegression } from "simple-statistics";
import {
  parseTimeDuration,
  TimeDurationStr,
  timeUnits,
} from "../duration/duration";
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
  hass: HomeAssistant;
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
    ({ ys, meta }) => {
      const mapping = mappingStr.map((str) => str.split("->").map(parseFloat));
      const regression = linearRegression(mapping);
      const mapper = linearRegressionLine(regression);
      return {
        ys: mapNumbers(ys, mapper),
        meta: { ...meta, regression },
      };
    },
  deduplicate_adjacent:
    () =>
    ({ xs, ys, states, statistics }) => {
      const mask = ys.map((y, i) => y === ys[i - 1]);
      return {
        ys: ys.filter((_, i) => mask[i]),
        xs: xs.filter((_, i) => mask[i]),
        states: states.filter((_, i) => mask[i]),
        statistics: statistics.filter((_, i) => mask[i]),
      };
    },
  delta:
    () =>
    ({ ys, meta }) => {
      const last = {
        y: NaN,
      };
      return {
        meta: {
          ...meta,
          unit_of_measurement: `Δ${meta.unit_of_measurement}`,
        },
        ys: mapNumbers(ys, (y) => {
          const yDelta = y - last.y;
          last.y = y;
          return yDelta;
        }),
      };
    },
  derivate:
    (unit: keyof typeof timeUnits = "h") =>
    ({ xs, ys, meta }) => {
      const last = {
        x: +xs[0],
        y: NaN,
      };
      checkTimeUnits(unit);
      return {
        meta: {
          ...meta,
          unit_of_measurement: `${meta.unit_of_measurement}/${unit}`,
        },
        xs,
        ys: mapNumbers(ys, (y, i) => {
          const x = +xs[i];
          const dateDelta = (x - last.x) / timeUnits[unit];
          const yDeriv = (y - last.y) / dateDelta;
          last.y = y;
          last.x = x;
          return yDeriv;
        }),
      };
    },
  integrate:
    (unit: keyof typeof timeUnits = "h") =>
    ({ xs, ys, meta }) => {
      checkTimeUnits(unit);
      let yAcc = 0;
      let last = {
        x: NaN,
      };
      return {
        meta: {
          ...meta,
          unit_of_measurement: `${meta.unit_of_measurement}${unit}`,
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
      return { xs: xs2, ys: ys2, ...rest };
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
          const sorted = acc.ys.slice().sort();
          const mid1 = Math.floor(sorted.length / 2);
          const mid2 = Math.ceil(sorted.length / 2);
          ys2.push((sorted[mid1] + sorted[mid2]) / 2);
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
    const fn = myEval(`(i, x, y, state, statistic, vars, hass) => ${fnStr}`);
    return ({ xs, ys, states, statistics, vars, hass }) => ({
      xs,
      ys: mapNumbers(ys, (y, i) =>
        fn(i, xs[i], y, states[i], statistics[i], vars, hass)
      ),
    });
  },
  map_y: (fnStr: string) => {
    const fn = myEval(`(i, x, y, state, statistic, vars, hass) => ${fnStr}`);
    return ({ xs, ys, states, statistics, vars, hass }) => ({
      xs,
      ys: ys.map((_, i) =>
        fn(i, xs[i], ys[i], states[i], statistics[i], vars, hass)
      ),
    });
  },
  map_x: (fnStr: string) => {
    const fn = myEval(`(i, x, y, state, statistic, vars, hass) => ${fnStr}`);
    return ({ xs, ys, states, statistics, vars, hass }) => ({
      ys,
      xs: xs.map((_, i) =>
        fn(i, xs[i], ys[i], states[i], statistics[i], vars, hass)
      ),
    });
  },
  resample:
    (intervalStr: TimeDurationStr = "5m") =>
    ({ xs, ys, states, statistics }) => {
      const data = {
        xs: [] as Date[],
        ys: [] as YValue[],
        states: [] as HassEntity[],
        statistics: [] as StatisticValue[],
      };
      const interval = parseTimeDuration(intervalStr);
      const x0 = Math.floor(+xs[0] / interval) * interval;
      const x1 = +xs[xs.length - 1];
      let i = 0;
      for (let x = x0; x < x1; x += interval) {
        while (+xs[i + 1] < x && i < xs.length - 1) {
          i++;
        }
        data.xs.push(new Date(x));
        data.ys.push(ys[i]);
        if (states[i]) data.states.push(states[i]);
        if (statistics[i]) data.statistics.push(statistics[i]);
      }
      return data;
    },
  store_var:
    (var_name: string) =>
    ({ hass, vars, ...rest }) => ({ vars: { ...vars, [var_name]: rest } }),
  /*
    example: fn("({xs, ys, states, statistics }) => ({xs: ys})")
  */
  fn: (fnStr: string) => myEval(fnStr),
  filter: (fnStr: string) => {
    const fn = myEval(
      `(i, x, y, xs, ys, state, statistic, vars, hass) => ${fnStr}`
    );
    return ({ xs, ys, states, statistics, vars, hass }) => {
      const mask = ys.map((_, i) =>
        fn(i, xs[i], ys[i], xs, ys, states[i], statistics[i], vars, hass)
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
function checkTimeUnits(unit: string) {
  if (!timeUnits[unit]) {
    throw new Error(
      `Unit '${unit}' is not valid, use ${Object.keys(timeUnits)}`
    );
  }
}

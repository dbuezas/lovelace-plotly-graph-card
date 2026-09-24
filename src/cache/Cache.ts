import { HomeAssistant } from "custom-card-helpers";
import { compactRanges, subtractRanges } from "./date-ranges";
import fetchStatistics from "./fetch-statistics";
import fetchStates, { fetchStatesBatch } from "./fetch-states";
import {
  TimestampRange,
  isEntityIdAttrConfig,
  EntityConfig,
  isEntityIdStateConfig,
  isEntityIdStatisticsConfig,
  CachedEntity,
  CachedStatisticsEntity,
  CachedStateEntity,
  EntityData,
} from "../types";
export type FetchConfig =
  | {
      statistic: "state" | "sum" | "min" | "max" | "mean";
      period: "5minute" | "hour" | "day" | "week" | "month";
      entity: string;
    }
  | {
      attribute: string;
      entity: string;
    }
  | {
      entity: string;
    };
export type HistoryFetchConfig = Exclude<
  FetchConfig,
  { statistic: string; period: string }
>;
export type HistoryFetchRequest = {
  entity: HistoryFetchConfig;
  range: TimestampRange;
};
export function mapValues<T, S>(
  o: Record<string, T>,
  fn: (value: T, key: string) => S
) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v, k)]));
}
async function fetchSingleRange(
  hass: HomeAssistant,
  entity: FetchConfig,
  [startT, endT]: number[]
): Promise<{
  range: [number, number];
  history: CachedEntity[];
}> {
  // We fetch slightly more than requested (i.e the range visible in the screen). The reason is the following:
  // When fetching data in a range `[startT,endT]`, Home Assistant adds a fictitious datapoint at
  // the start of the fetched period containing a copy of the first datapoint that occurred before
  // `startT`, except if there is actually one at `startT`.
  // We fetch slightly more than requested/visible (`[startT-1,endT]`) and we mark the datapoint at
  // `startT-1` to be deleted (`fake_boundary_datapoint`). When merging the fetched data into the
  // cache, we keep the fictitious datapoint only if it's placed at the start (see `add` function), otherwise it's
  // discarded.
  // In general, we don't really know whether the datapoint is fictitious or it's a real datapoint
  // that happened to be exactly at `startT-1`, therefore we purposely fetch it outside the requested range
  // (which is `[startT,endT]`) and we leave it out of the "known cached ranges".
  // If it happens to be a a real datapoint, it will be fetched properly when the user scrolls/zooms bring it into
  // the visible part of the screen.
  //
  // Examples:
  //
  // * = fictitious
  // + = real
  // _ = fetched range
  //
  //       _________       1st fetch
  //       * +   +
  //       ^
  //       '-- point kept because it's at the start-edge of the trace and it's outside the visible range
  //
  // _______               2nd fetch
  // *   + * +   +
  // ^     ^
  // |     '--- discarded as it was fictitious and not at the start-edge
  // '--- point at the edge, kept
  //
  //              ________ 3rd fetch
  // *   +   +   +*  +   +
  // ^            ^
  // |            '--- discarded as it is fictitious
  // '--- point at the edge, kept
  //
  // The above does not apply to statistics data where there are no fake data points.

  const apiRange = getHistoryApiRange([startT, endT]);
  endT = apiRange.range[1];
  const [start, end] = apiRange.dates;
  let history: CachedEntity[];
  if (isEntityIdStatisticsConfig(entity)) {
    history = await fetchStatistics(hass, entity, [start, end]);
  } else {
    history = await fetchStates(hass, entity, [start, end]);
    if (history.length) {
      history[0].fake_boundary_datapoint = true;
    }
  }

  let range: [number, number] = [startT, endT];
  return {
    range,
    history,
  };
}

function getHistoryApiRange([startT, endT]: TimestampRange, now = Date.now()) {
  const l = Math.max(0, 5000 - (endT - startT));
  const range: [number, number] = [startT, Math.min(endT, now)];
  return {
    range,
    dates: [new Date(startT - 1 - l), new Date(range[1])] as [Date, Date],
  };
}

export function getEntityKey(entity: FetchConfig) {
  if (isEntityIdAttrConfig(entity)) {
    return `${entity.entity}::attribute:`;
  } else if (isEntityIdStatisticsConfig(entity)) {
    return `${entity.entity}::statistics::${entity.period}`;
  } else if (isEntityIdStateConfig(entity)) {
    return `${entity.entity}`;
  }
  throw new Error(`Entity malformed:${JSON.stringify(entity)}`);
}

const MIN_SAFE_TIMESTAMP = Date.parse("0001-01-02T00:00:00.000Z");
export default class Cache {
  ranges: Record<string, TimestampRange[]> = {};
  histories: Record<string, CachedEntity[]> = {};
  busy: Promise<unknown> = Promise.resolve(); // mutex

  add(entity: FetchConfig, states: CachedEntity[], range: [number, number]) {
    const entityKey = getEntityKey(entity);
    let h = (this.histories[entityKey] ??= []);
    h.push(...states);
    h.sort((a, b) => +a.x - +b.x);
    if (!isEntityIdStatisticsConfig(entity)) {
      h = h.filter((x, i) => i == 0 || !x.fake_boundary_datapoint);
    }
    h = h.filter((_, i) => +h[i - 1]?.x !== +h[i].x);
    this.histories[entityKey] = h;
    this.ranges[entityKey] ??= [];
    this.ranges[entityKey].push(range);
    this.ranges[entityKey] = compactRanges(this.ranges[entityKey]);
  }

  clearCache() {
    this.ranges = {};
    this.histories = {};
  }

  getData(entity: FetchConfig): EntityData {
    let key = getEntityKey(entity);
    const history = this.histories[key] || [];
    const data: EntityData = {
      xs: [],
      ys: [],
      states: [],
      statistics: [],
    };
    data.xs = history.map(({ x }) => x);
    if (isEntityIdStatisticsConfig(entity)) {
      data.statistics = (history as CachedStatisticsEntity[]).map(
        ({ statistics }) => statistics
      );
      data.ys = data.statistics.map((s) => s[entity.statistic]);
    } else if (isEntityIdAttrConfig(entity)) {
      data.states = (history as CachedStateEntity[]).map(({ state }) => state);
      data.ys = data.states.map((s) => s.attributes[entity.attribute]);
    } else if (isEntityIdStateConfig(entity)) {
      data.states = (history as CachedStateEntity[]).map(({ state }) => state);
      data.ys = data.states.map((s) => s.state);
    } else
      throw new Error(
        `Unrecognised fetch type for ${(entity as EntityConfig).entity}`
      );
    data.ys = data.ys.map((y) =>
      // see https://github.com/dbuezas/lovelace-plotly-graph-card/issues/146
      // and https://github.com/dbuezas/lovelace-plotly-graph-card/commit/3d915481002d03011bcc8409c2dcc6e6fb7c8674#r94899109
      y === "unavailable" || y === "none" || y === "unknown" ? null : y
    );
    return data;
  }

  async prefetchHistory(
    requests: HistoryFetchRequest[],
    hass: HomeAssistant,
  ): Promise<void> {
    await (this.busy = this.busy
      .catch(() => {})
      .then(async () => {
        const jobs = new Map<
          string,
          {
            entity: HistoryFetchConfig;
            range: [number, number];
          }
        >();
        for (const request of requests) {
          const range = request.range.map((n) =>
            Math.max(MIN_SAFE_TIMESTAMP, n),
          ) as [number, number];
          const entityKey = getEntityKey(request.entity);
          this.ranges[entityKey] ??= [];
          for (const missingRange of subtractRanges(
            [range],
            this.ranges[entityKey],
          )) {
            const jobKey = `${entityKey}:${missingRange[0]}:${missingRange[1]}`;
            jobs.set(jobKey, {
              entity: request.entity,
              range: missingRange as [number, number],
            });
          }
        }

        const groups = new Map<
          string,
          {
            dates: [Date, Date];
            range: [number, number];
            jobs: {
              entity: HistoryFetchConfig;
              range: [number, number];
            }[];
          }
        >();
        const now = Date.now();
        for (const job of jobs.values()) {
          const apiRange = getHistoryApiRange(job.range, now);
          const includeAttributes = isEntityIdAttrConfig(job.entity);
          const groupKey = `${includeAttributes}:${+apiRange.dates[0]}:${+apiRange.dates[1]}`;
          const group = groups.get(groupKey) ?? {
            dates: apiRange.dates,
            range: apiRange.range,
            jobs: [],
          };
          group.jobs.push(job);
          groups.set(groupKey, group);
        }

        for (const group of groups.values()) {
          const statesByEntity = await fetchStatesBatch(
            hass,
            group.jobs.map(({ entity }) => entity),
            group.dates,
          );
          for (const { entity, range } of group.jobs) {
            const history = statesByEntity[entity.entity] ?? [];
            if (history.length) history[0].fake_boundary_datapoint = true;
            this.add(entity, history, [
              range[0],
              Math.min(range[1], group.range[1]),
            ]);
          }
        }
      }));
  }

  async fetch(range: TimestampRange, entity: FetchConfig, hass: HomeAssistant) {
    const fetchPromise = this.busy
      .catch(() => {})
      .then(async () => {
        range = range.map((n) => Math.max(MIN_SAFE_TIMESTAMP, n)); // HA API can't handle negative years
        if (entity.entity) {
          const entityKey = getEntityKey(entity);
          this.ranges[entityKey] ??= [];
          const rangesToFetch = subtractRanges([range], this.ranges[entityKey]);
          for (const aRange of rangesToFetch) {
            const fetchedHistory = await fetchSingleRange(hass, entity, aRange);
            this.add(entity, fetchedHistory.history, fetchedHistory.range);
          }
        }
        return this.getData(entity);
      });
    this.busy = fetchPromise;
    return fetchPromise;
  }
}

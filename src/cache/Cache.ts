import { HomeAssistant } from "custom-card-helpers";
import type { StatisticPeriod } from "../recorder-types";
import { compactRanges, subtractRanges } from "./date-ranges";
import fetchStatistics from "./fetch-statistics";
import fetchStates, { fetchStatesBatch } from "./fetch-states";
import {
  getStatisticsUpdatePeriod,
  isLiveStatisticsRange,
  StatisticsUpdatePeriod,
} from "./statistics-refresh";
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
  EntityIdStatisticsConfig,
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

function getFetchRange([startT, endT]: number[], now = Date.now()) {
  const l = Math.max(0, 5000 - (endT - startT));
  const start = new Date(startT - 1 - l);
  endT = Math.min(endT, now);
  return {
    dates: [start, new Date(endT)] as [Date, Date],
    range: [startT, endT] as [number, number],
  };
}

async function fetchSingleRange(
  hass: HomeAssistant,
  entity: FetchConfig,
  [startT, endT]: number[]
): Promise<{
  range: [number, number];
  history: CachedEntity[];
  fetchedAt: number;
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

  const fetchedAt = Date.now();
  const { dates, range } = getFetchRange([startT, endT], fetchedAt);
  let history: CachedEntity[];
  if (isEntityIdStatisticsConfig(entity)) {
    history = (await fetchStatistics(hass, [entity], dates))[entity.entity];
  } else {
    history = await fetchStates(hass, entity, dates);
    if (history.length) {
      history[0].fake_boundary_datapoint = true;
    }
  }

  return {
    range,
    history,
    fetchedAt,
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

function upperBound(history: CachedEntity[], timestamp: number) {
  let low = 0;
  let high = history.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (+history[middle].x <= timestamp) low = middle + 1;
    else high = middle;
  }
  return low;
}

function selectHistory(
  history: CachedEntity[],
  ranges: TimestampRange[]
): CachedEntity[] {
  const selected: CachedEntity[] = [];
  for (const [start, end] of compactRanges(ranges)) {
    // Keep the latest point at or before the range so the trace reaches the
    // left edge even when no state changed there.
    const firstAfterStart = upperBound(history, start);
    const first = Math.max(0, firstAfterStart - 1);
    const last = upperBound(history, end);
    if (first === 0 && last === history.length) return history;
    for (let index = first; index < last; index++) {
      const state = history[index];
      const previous = selected[selected.length - 1];
      if (!previous || +previous.x !== +state.x) selected.push(state);
    }
  }
  return selected;
}

function intersectRanges(
  cachedRanges: TimestampRange[],
  retainedRanges: TimestampRange[]
) {
  return compactRanges(
    cachedRanges.flatMap(([cachedStart, cachedEnd]) =>
      retainedRanges.flatMap(([retainedStart, retainedEnd]) => {
        const start = Math.max(cachedStart, retainedStart);
        const end = Math.min(cachedEnd, retainedEnd);
        return start <= end ? [[start, end]] : [];
      })
    )
  );
}

export default class Cache {
  ranges: Record<string, TimestampRange[]> = {};
  histories: Record<string, CachedEntity[]> = {};
  busy: Promise<unknown> = Promise.resolve(); // mutex
  private mutableStatistics: Record<
    string,
    { from: number; fetchedAt: number; period: StatisticPeriod }
  > = {};

  refreshStatistics(now: number, period?: StatisticsUpdatePeriod) {
    if (Object.keys(this.mutableStatistics).length === 0) return;
    return this.enqueue(async () => {
      for (const [key, mutable] of Object.entries(this.mutableStatistics)) {
        if (period && getStatisticsUpdatePeriod(mutable.period) !== period)
          continue;
        if (mutable.fetchedAt >= now) continue;
        this.ranges[key] = subtractRanges(
          this.ranges[key] || [],
          [[mutable.from, Number.POSITIVE_INFINITY]],
        );
        delete this.mutableStatistics[key];
      }
    });
  }

  private trackMutableStatistics(
    entity: EntityIdStatisticsConfig,
    history: CachedStatisticsEntity[],
    range: TimestampRange,
    fetchedAt: number,
  ) {
    if (!isLiveStatisticsRange(range, entity.period, fetchedAt)) return;
    const latest = history.reduce<CachedStatisticsEntity | undefined>(
      (last, row) => (!last || +row.x > +last.x ? row : last),
      undefined
    );
    const end = latest ? +new Date(latest.statistics.end) : NaN;
    // Completed buckets are stable, but their missing successors are not.
    // Calendar aggregates may still be partial at rollover if the final
    // hourly row has not been published yet.
    const complete = entity.period === "5minute" || entity.period === "hour";
    const from = latest
      ? complete && Number.isFinite(end) && end > +latest.x && end <= fetchedAt
        ? end
        : +latest.x
      : range[0];
    this.mutableStatistics[getEntityKey(entity)] = {
      from,
      fetchedAt,
      period: entity.period,
    };
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this.busy.catch(() => {}).then(job);
    this.busy = result;
    return result;
  }

  add(entity: FetchConfig, states: CachedEntity[], range: [number, number]) {
    const entityKey = getEntityKey(entity);
    let h = (this.histories[entityKey] ??= []);
    // A newer single sample cannot disturb the sorted, deduplicated history.
    const canAppend =
      states.length === 1 &&
      h.length > 0 &&
      +states[0].x > +h[h.length - 1].x &&
      (!states[0].fake_boundary_datapoint || isEntityIdStatisticsConfig(entity));
    if (canAppend) {
      h.push(states[0]);
    } else {
      for (const state of states) h.push(state);
      h.sort((a, b) => +a.x - +b.x);
      if (!isEntityIdStatisticsConfig(entity)) {
        h = h.filter((x, i) => i == 0 || !x.fake_boundary_datapoint);
      }
      // Refetched aggregates can change without changing their bucket timestamp.
      h = isEntityIdStatisticsConfig(entity)
        ? h.filter((_, i) => +h[i].x !== +h[i + 1]?.x)
        : h.filter((_, i) => +h[i - 1]?.x !== +h[i].x);
      this.histories[entityKey] = h;
    }
    this.ranges[entityKey] ??= [];
    this.ranges[entityKey].push(range);
    this.ranges[entityKey] = compactRanges(this.ranges[entityKey]);
  }

  clearCache() {
    this.ranges = {};
    this.histories = {};
    this.mutableStatistics = {};
  }

  getData(entity: FetchConfig, ranges?: TimestampRange[]): EntityData {
    let key = getEntityKey(entity);
    const cachedHistory = this.histories[key] || [];
    const history = ranges
      ? selectHistory(cachedHistory, ranges)
      : cachedHistory;
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
    await this.enqueue(async () => {
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
        const apiRange = getFetchRange(job.range, now);
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
    });
  }

  retain(retainedRanges: Record<string, TimestampRange[]>) {
    const keys = new Set([
      ...Object.keys(this.histories),
      ...Object.keys(this.ranges),
    ]);
    for (const key of keys) {
      const ranges = compactRanges(retainedRanges[key] || []);
      if (ranges.length === 0) {
        delete this.mutableStatistics[key];
        delete this.histories[key];
        delete this.ranges[key];
        continue;
      }
      this.histories[key] = selectHistory(this.histories[key] || [], ranges);
      this.ranges[key] = intersectRanges(this.ranges[key] || [], ranges);
    }
  }

  async prefetchStatistics(
    requests: {
      range: TimestampRange;
      entity: EntityIdStatisticsConfig;
    }[],
    hass: HomeAssistant
  ): Promise<void> {
    await this.enqueue(async () => {
      const now = Date.now();
      const groups = new Map<
        string,
        {
          dates: [Date, Date];
          range: [number, number];
          entities: Map<string, EntityIdStatisticsConfig>;
        }
      >();

      for (const request of requests) {
        const range = request.range.map((n) => Math.max(MIN_SAFE_TIMESTAMP, n));
        const entityKey = getEntityKey(request.entity);
        this.ranges[entityKey] ??= [];
        const rangesToFetch = subtractRanges([range], this.ranges[entityKey]);

        for (const missingRange of rangesToFetch) {
          const { dates, range: fetchedRange } = getFetchRange(
            missingRange,
            now
          );
          const groupKey = JSON.stringify([
            request.entity.period,
            +dates[0],
            +dates[1],
          ]);
          let group = groups.get(groupKey);
          if (!group) {
            group = {
              dates,
              range: fetchedRange,
              entities: new Map(),
            };
            groups.set(groupKey, group);
          }
          group.entities.set(request.entity.entity, request.entity);
        }
      }

      for (const group of groups.values()) {
        const entities = [...group.entities.values()];
        const histories = await fetchStatistics(hass, entities, group.dates);
        for (const entity of entities) {
          this.add(entity, histories[entity.entity], group.range);
          this.trackMutableStatistics(
            entity, histories[entity.entity], group.range, now
          );
        }
      }
    });
  }

  async fetch(
    range: TimestampRange,
    entity: FetchConfig,
    hass: HomeAssistant,
    dataRanges: TimestampRange[] = [range]
  ) {
    return this.enqueue(async () => {
      range = range.map((n) => Math.max(MIN_SAFE_TIMESTAMP, n)); // HA API can't handle negative years
      if (entity.entity) {
        const entityKey = getEntityKey(entity);
        this.ranges[entityKey] ??= [];
        const rangesToFetch = subtractRanges([range], this.ranges[entityKey]);
        for (const aRange of rangesToFetch) {
          const fetchedHistory = await fetchSingleRange(hass, entity, aRange);
          this.add(entity, fetchedHistory.history, fetchedHistory.range);
          if (isEntityIdStatisticsConfig(entity)) {
            this.trackMutableStatistics(
              entity,
              fetchedHistory.history as CachedStatisticsEntity[],
              fetchedHistory.range,
              fetchedHistory.fetchedAt,
            );
          }
        }
      }
      return this.getData(entity, dataRanges);
    });
  }
}

import { HomeAssistant } from "custom-card-helpers";
import { compactRanges, subtractRanges } from "./date-ranges";
import fetchStatistics from "./fetch-statistics";
import fetchStates from "./fetch-states";
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
type FetchConfig =
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

  const l = Math.max(0, 5000 - (endT - startT)); // The HA API doesn't add the fake boundary if the interval requested is too small
  const start = new Date(startT - 1 - l);
  endT = Math.min(endT, Date.now());
  const end = new Date(endT);
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
  busy: Promise<EntityData> = Promise.resolve(null as unknown as EntityData); // mutex

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
  async fetch(range: TimestampRange, entity: FetchConfig, hass: HomeAssistant) {
    return (this.busy = this.busy
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
      }));
  }
}

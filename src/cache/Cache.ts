import { HomeAssistant } from "custom-card-helpers";
import { compactRanges, subtractRanges } from "./date-ranges";
import fetchStatistics from "./fetch-statistics";
import fetchStates from "./fetch-states";
import {
  TimestampRange,
  History,
  isEntityIdAttrConfig,
  EntityIdConfig,
  isEntityIdStateConfig,
  isEntityIdStatisticsConfig,
  HistoryInRange,
} from "../types";

export function mapValues<T, S>(
  o: Record<string, T>,
  fn: (value: T, key: string) => S
) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v, k)]));
}
async function fetchSingleRange(
  hass: HomeAssistant,
  entity: EntityIdConfig,
  [startT, endT]: number[],
  significant_changes_only: boolean,
  minimal_response: boolean
): Promise<HistoryInRange> {
  const start = new Date(startT);
  const end = new Date(endT);
  let historyInRange: HistoryInRange;
  if (isEntityIdStatisticsConfig(entity)) {
    historyInRange = await fetchStatistics(hass, entity, [start, end]);
  } else {
    historyInRange = await fetchStates(
      hass,
      entity,
      [start, end],
      significant_changes_only,
      minimal_response
    );
  }

  const { history, range } = historyInRange;
  /*
  home assistant will "invent" a datapoiont at startT with the previous known value, except if there is actually one at startT.
  To avoid these duplicates, the "fetched range" is capped to end at the last known point instead of endT.
  This ensures that the next fetch will start with a duplicate of the last known datapoint, which can then be removed.
  On top of that, in order to ensure that the last known point is extended to endT, I duplicate the last datapoint
  and set its date to endT.
  */
  if (history.length) {
    const last = history[history.length - 1];
    const dup = JSON.parse(JSON.stringify(last));
    history[0].duplicate_datapoint = true;
    dup.duplicate_datapoint = true;
    dup.last_updated = Math.min(+end, Date.now());
    history.push(dup);
  }
  Math.min(+end, Date.now());
  return {
    range: [range[0], Math.min(range[1], Date.now())],
    history,
  };
}

export function getEntityKey(entity: EntityIdConfig) {
  if (isEntityIdAttrConfig(entity)) {
    return `${entity.entity}::${entity.attribute}`;
  } else if (isEntityIdStatisticsConfig(entity)) {
    return `${entity.entity}::statistics::${entity.statistic}::${entity.period}`;
  } else if (isEntityIdStateConfig(entity)) {
    return entity.entity;
  }
  throw new Error(`Entity malformed:${JSON.stringify(entity)}`);
}
export default class Cache {
  ranges: Record<string, TimestampRange[]> = {};
  histories: Record<string, History> = {};
  busy = Promise.resolve(); // mutex
  clearCache() {
    this.ranges = {};
    this.histories = {};
  }
  getHistory(entity: EntityIdConfig) {
    let key = getEntityKey(entity);
    return this.histories[key] || [];
  }
  async update(
    range: TimestampRange,
    removeOutsideRange: boolean,
    entities: EntityIdConfig[],
    hass: HomeAssistant,
    significant_changes_only: boolean,
    minimal_response: boolean
  ) {
    return (this.busy = this.busy
      .catch(() => {})
      .then(async () => {
        if (removeOutsideRange) {
          this.removeOutsideRange(range);
        }
        const promises = entities.flatMap(async (entity) => {
          const entityKey = getEntityKey(entity);
          this.ranges[entityKey] ??= [];
          const rangesToFetch = subtractRanges([range], this.ranges[entityKey]);
          for (const aRange of rangesToFetch) {
            const fetchedHistory = await fetchSingleRange(
              hass,
              entity,
              aRange,
              significant_changes_only,
              minimal_response
            );
            if (fetchedHistory === null) continue;
            let h = (this.histories[entityKey] ??= []);
            h.push(...fetchedHistory.history);
            h.sort((a, b) => a.last_updated - b.last_updated);
            h = h.filter(
              (x, i) => i == 0 || i == h.length - 1 || !x.duplicate_datapoint
            );
            h = h.filter(
              (_, i) => h[i].last_updated !== h[i + 1]?.last_updated
            );
            this.histories[entityKey] = h;
            this.ranges[entityKey].push(fetchedHistory.range);
            this.ranges[entityKey] = compactRanges(this.ranges[entityKey]);
          }
        });

        await Promise.all(promises);
      }));
  }

  private removeOutsideRange(range: TimestampRange) {
    this.ranges = mapValues(this.ranges, (ranges) =>
      subtractRanges(ranges, [
        [Number.NEGATIVE_INFINITY, range[0] - 1],
        [range[1] + 1, Number.POSITIVE_INFINITY],
      ])
    );
    let first: History[0];
    let last: History[0];
    this.histories = mapValues(this.histories, (history) => {
      const newHistory = history.filter((datum) => {
        if (datum.last_updated <= range[0]) first = datum;
        else if (!last && datum.last_updated >= range[1]) last = datum;
        else return true;
        return false;
      });
      if (first) {
        first.last_updated = range[0];
        newHistory.unshift(first);
      }
      if (last) {
        last.last_updated = range[1];
        newHistory.push(last);
      }
      return newHistory;
    });
  }
}

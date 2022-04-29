import { HomeAssistant } from "custom-card-helpers";
import { compactRanges, subtractRanges } from "./date-ranges";
import { isTruthy } from "./style-hack";
import { TimestampRange, History } from "./types";
import { sleep } from "./utils";

export function mapValues<T, S>(
  o: Record<string, T>,
  fn: (value: T, key: string) => S
) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v, k)]));
}
async function fetchSingleRange(
  hass: HomeAssistant,
  entityIdWithAttribute: string,
  [startT, endT]: number[],
  significant_changes_only: boolean,
  minimal_response: boolean
) {
  const start = new Date(startT);
  const end = new Date(endT);
  const [entityId2, attribute] = entityIdWithAttribute.split("::");
  const minimal_response_query =
    minimal_response && !attribute ? "minimal_response&" : "";
  const significant_changes_only_query =
    significant_changes_only && !attribute ? "1" : "0";
  const uri =
    `history/period/${start.toISOString()}?` +
    `filter_entity_id=${entityId2}&` +
    `significant_changes_only=${significant_changes_only_query}&` +
    minimal_response_query +
    `end_time=${end.toISOString()}`;
  let list: History | undefined;
  let succeeded = false;
  let retries = 0;
  while (!succeeded) {
    try {
      const lists: History[] = (await hass.callApi("GET", uri)) || [];
      list = lists[0];
      succeeded = true;
    } catch (e) {
      console.error(e);
      retries++;
      if (retries > 50) return null;
      await sleep(100);
    }
  }
  if (!list || list.length == 0) return null;

  /*
  home assistant will "invent" a datapoiont at startT with the previous known value, except if there is actually one at startT.
  To avoid these duplicates, the "fetched range" is capped to end at the last known point instead of endT.
  This ensures that the next fetch will start with a duplicate of the last known datapoint, which can then be removed.
  On top of that, in order to ensure that the last known point is extended to endT, I duplicate the last datapoint
  and set its date to endT.
  */
  const last = list[list.length - 1];
  const dup = JSON.parse(JSON.stringify(last));
  list[0].duplicate_datapoint = true;
  dup.duplicate_datapoint = true;
  dup.last_updated = Math.min(endT, Date.now());
  list.push(dup);
  return {
    entityId: entityIdWithAttribute,
    range: [
      startT,
      +new Date(last.last_updated),
    ], // cap range to now
    attributes: {
      unit_of_measurement: "",
      ...list[0].attributes,
    },
    history: list.map((entry) => ({
      ...entry,
      state: attribute ? entry.attributes[attribute] : entry.state,
      last_updated: +new Date(entry.last_updated || entry.last_changed),
    })),
  };
}
export default class Cache {
  ranges: Record<string, TimestampRange[]> = {};
  histories: Record<string, History> = {};
  attributes: Record<string, History[0]["attributes"]> = {};
  busy = Promise.resolve();
  clearCache() {
    this.ranges = {};
    this.histories = {};
  }
  async update(
    range: TimestampRange,
    removeOutsideRange: boolean,
    entityNames: string[],
    hass: HomeAssistant,
    significant_changes_only: boolean,
    minimal_response: boolean
  ) {
    entityNames = Array.from(new Set(entityNames)); // remove duplicates
    return (this.busy = this.busy
      .catch(() => {})
      .then(() =>
        this._update(
          range,
          removeOutsideRange,
          entityNames,
          hass,
          significant_changes_only,
          minimal_response
        )
      ));
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
  private async _update(
    range: TimestampRange,
    removeOutsideRange: boolean,
    entityNames: string[],
    hass: HomeAssistant,
    significant_changes_only: boolean,
    minimal_response: boolean
  ) {
    if (removeOutsideRange) {
      this.removeOutsideRange(range);
    }
    for (const entity of entityNames) {
      this.ranges[entity] ??= [];
    }
    const fetchedHistoriesP = Promise.all(
      entityNames.flatMap((entityId) => {
        const rangesToFetch = subtractRanges([range], this.ranges[entityId]);
        return rangesToFetch.map((aRange) =>
          fetchSingleRange(
            hass,
            entityId,
            aRange,
            significant_changes_only,
            minimal_response
          )
        );
      })
    );
    const fetchedHistories = (await fetchedHistoriesP).filter(isTruthy);
    // add to existing histories
    for (const fetchedHistory of fetchedHistories) {
      const { entityId } = fetchedHistory;
      let h = (this.histories[entityId] ??= []);
      h.push(...fetchedHistory.history);
      h.sort((a, b) => a.last_updated - b.last_updated);
      h = h.filter(
        (x, i) => i == 0 || i == h.length - 1 || !x.duplicate_datapoint
      );
      h = h.filter((_, i) => h[i].last_updated !== h[i + 1]?.last_updated);
      this.histories[entityId] = h;
      this.attributes[entityId] = fetchedHistory.attributes;
      this.ranges[entityId].push(fetchedHistory.range);
      this.ranges[entityId] = compactRanges(this.ranges[entityId]);
    }
  }
}

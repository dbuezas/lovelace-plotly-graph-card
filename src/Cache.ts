import { HomeAssistant } from "custom-card-helpers";
import { compactRanges, subtractRanges } from "./date-ranges";
import { isTruthy } from "./style-hack";
import { TimestampRange, History } from "./types";
import { sleep } from "./utils";

type Histories = Record<string, History>;

export function mapValues<T, S>(
  o: Record<string, T>,
  fn: (value: T, key: string) => S
) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v, k)]));
}
async function fetchSingleRange(
  hass: HomeAssistant,
  entityIdWithAttribute: string,
  [startT, endT]: number[]
) {
  const start = new Date(startT);
  const end = new Date(endT);
  const [entityId2, attribute] = entityIdWithAttribute.split("::");
  const minimal_response = !attribute ? "&minimal_response" : "";
  const uri =
    `history/period/${start.toISOString()}?` +
    `filter_entity_id=${entityId2}&` +
    `significant_changes_only=1` +
    minimal_response +
    `&end_time=${end.toISOString()}`;
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
      await sleep(100)
    }
  }
  if (!list) return null;
  return {
    entityId: entityIdWithAttribute,
    range: [startT, Math.min(+new Date(), endT)], // cap range to now
    attributes: {
      unit_of_measurement: "",
      ...list[0].attributes,
    },
    history: list.map((entry) => ({
      ...entry,
      state: attribute ? entry.attributes[attribute] : entry.state,
      last_changed: +new Date(
        attribute ? entry.last_updated : entry.last_changed
      ),
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
    hass: HomeAssistant
  ) {
    return (this.busy = this.busy
      .catch(() => {})
      .then(() => this._update(range, removeOutsideRange, entityNames, hass)));
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
        if (datum.last_changed <= range[0]) first = datum;
        else if (!last && datum.last_changed >= range[1]) last = datum;
        else return true;
        return false;
      });
      if (first) {
        first.last_changed = range[0];
        newHistory.unshift(first);
      }
      if (last) {
        last.last_changed = range[1];
        newHistory.push(last);
      }
      return newHistory;
    });
  }
  private async _update(
    range: TimestampRange,
    removeOutsideRange: boolean,
    entityNames: string[],
    hass: HomeAssistant
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
          fetchSingleRange(hass, entityId, aRange)
        );
      })
    );
    const fetchedHistories = (await fetchedHistoriesP).filter(isTruthy);
    // add to existing histories
    for (const fetchedHistory of fetchedHistories) {
      const { entityId } = fetchedHistory;
      const h = (this.histories[entityId] ??= []);
      h.push(...fetchedHistory.history);
      h.sort((a, b) => a.last_changed - b.last_changed);
      // remove the rogue datapoint home assistant creates when there is no new data
      const [prev, last] = h.slice(-2);
      const isRepeated =
        prev?.last_changed === last?.last_changed - 1 &&
        prev?.state === last?.state;
      if (isRepeated) {
        // remove the old one
        h.splice(h.length - 2, 1);
      }
      this.attributes[entityId] = fetchedHistory.attributes;
      this.ranges[entityId].push(fetchedHistory.range);
      this.ranges[entityId] = compactRanges(this.ranges[entityId]);
    }
  }
}

import { HomeAssistant } from "custom-card-helpers";
import { compactRanges, subtractRanges } from "./date-ranges";
import { TimestampRange, History } from "./types";

type Histories = Record<string, History>;

export function mapValues<T, S>(
  o: Record<string, T>,
  fn: (value: T, key: string) => S
) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v, k)]));
}
export default class Cache {
  ranges: TimestampRange[] = [];
  histories: Record<string, History> = {};
  attributes: Record<string, History[0]["attributes"]> = {};
  busy = Promise.resolve();
  clearCache() {
    this.ranges = [];
    this.histories = {};
  }
  async update(
    range: TimestampRange,
    removeOutsideRange: boolean,
    entityNames: string[],
    hass: HomeAssistant
  ) {
    return (this.busy = this.busy.then(() =>
      this._update(range, removeOutsideRange, entityNames, hass)
    ));
  }
  private removeOutsideRange2(range: TimestampRange) {
    // subtracting also the 1st and last milliseconds, so that those re refetched
    // and the plot starts right at the borders
    this.ranges = subtractRanges(this.ranges, [
      [Number.NEGATIVE_INFINITY, range[0]],
      [range[1], Number.POSITIVE_INFINITY],
    ]);
    this.histories = mapValues(this.histories, (history) =>
      history.filter(
        ({ last_changed }) =>
          range[0] <= last_changed && last_changed <= range[1]
      )
    );
  }
  private removeOutsideRange(range: TimestampRange) {
    this.ranges = subtractRanges(this.ranges, [
      [Number.NEGATIVE_INFINITY, range[0] - 1],
      [range[1] + 1, Number.POSITIVE_INFINITY],
    ]);
    let first: History[0];
    let last: History[0];
    this.histories = mapValues(this.histories, (history) => {
      const newHistory = history.filter((datum) => {
        if (datum.last_changed <= range[0]) first = datum;
        else if (datum.last_changed >= range[1]) last = datum;
        else return true;
        return false;
      });
      if (first) {
        first.last_changed = range[0];
        newHistory.unshift(first);
      }
      if (last) {
        first.last_changed = range[0];
        newHistory.unshift(first);
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
    const invalidte =
      JSON.stringify(Object.keys(this.histories)) !=
      JSON.stringify(entityNames);
    if (invalidte) {
      // entity names changed, clear cache
      this.clearCache();
    }
    if (removeOutsideRange) {
      this.removeOutsideRange(range);
    }
    const rangesToFetch = subtractRanges([range], this.ranges);
    const fetchedHistories = await Promise.all(
      rangesToFetch.map(async ([startT, endT]) => {
        const start = new Date(startT);
        const end = new Date(endT);
        const uri =
          `history/period/${start.toISOString()}?` +
          `filter_entity_id=${entityNames}&` +
          `significant_changes_only=1&` +
          `minimal_response&end_time=${end.toISOString()}`;
        let list: History[] = (await hass.callApi("GET", uri)) || [];
        const histories: Histories = {};
        for (const history of list) {
          const name = history[0].entity_id;
          this.attributes[name] = history[0].attributes;
          histories[name] = history.map((entry) => ({
            ...entry,
            last_changed: +new Date(entry.last_changed),
          }));
        }
        return histories;
      })
    );

    // add to existing histories
    for (const fetchedHistory of fetchedHistories) {
      for (const name of Object.keys(fetchedHistory)) {
        const h = (this.histories[name] ??= []);
        h.push(...fetchedHistory[name]);
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
      }
    }

    // cap the "known ranges" to the latest known timestamp
    let lastKnwonTimestamp = 0;
    for (const history of Object.values(this.histories)) {
      const timestamp = history[history.length - 1].last_changed;
      lastKnwonTimestamp = Math.max(lastKnwonTimestamp, timestamp);
    }

    let ranges = [...this.ranges, ...rangesToFetch];
    ranges = subtractRanges(ranges, [
      [lastKnwonTimestamp + 1, Number.POSITIVE_INFINITY],
    ]);

    this.ranges = compactRanges(ranges);
  }
}

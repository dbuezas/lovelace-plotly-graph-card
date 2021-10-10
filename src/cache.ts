import { HomeAssistant } from "custom-card-helpers"; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers
import { compactRanges, subtractRanges } from "./date-ranges";
import { DateRange, History } from "./types";

export type Cache = {
  ranges: DateRange[];
  histories: History[];
  entityNames: string[];
};

export const addToCache = async (
  cache: Cache,
  range: DateRange,
  hass: HomeAssistant,
  entityNames: string[]
) => {
  if (JSON.stringify(cache.entityNames) != JSON.stringify(entityNames)) {
    // entity names changed, clear cache
    cache = {
      ranges: [],
      histories: [],
      entityNames,
    };
  }
  const rangesToFetch = subtractRanges([range], cache.ranges);
  const fetchedHistories = await Promise.all(
    rangesToFetch.map(async ([start, end]) => {
      const uri =
        `history/period/${start.toISOString()}?` +
        `filter_entity_id=${entityNames}&` +
        `significant_changes_only=1&` +
        `minimal_response&end_time=${end.toISOString()}`;
      const r: History[] = (await hass.callApi("GET", uri)) || [];
      console.log("added:", r[0]?.length);
      return r.map((history) =>
        history.map((entry) => ({
          ...entry,
          last_changed: new Date(entry.last_changed),
        }))
      );
    })
  );
  const histories = [cache.histories, ...fetchedHistories].reduce(
    (acc, curr) =>
      acc.map((history, i) =>
        [...history, ...(curr[i] || [])].sort(
          (a, b) => a.last_changed.getTime() - b.last_changed.getTime()
        )
      ),
    entityNames.map(() => [])
  );
  const lastKnwonDate = new Date(
    Math.max(
      ...histories.map(
        (entityHistory) => +entityHistory.slice(-1)[0].last_changed + 1
      )
    )
  );

  let ranges = [...cache.ranges, ...rangesToFetch];
  var MAX_TIMESTAMP = 8640000000000000;
  ranges = subtractRanges(ranges, [[lastKnwonDate, new Date(MAX_TIMESTAMP)]]);

  const newCache = {
    ranges: compactRanges(ranges),
    histories,
    entityNames,
  };
  return newCache;
};

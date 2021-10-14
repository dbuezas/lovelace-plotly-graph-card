import { memo, useEffect, useRef } from "preact/compat";

import { atom, useRecoilValue, useSetRecoilState } from "recoil";
import { EntitiesAtom, HassAtom } from "./Card";
import { compactRanges, subtractRanges } from "./date-ranges";
import { rangeAtom } from "./hooks";
import { DateRange, History } from "./types";

export type Cache = {
  ranges: DateRange[];
  histories: Record<string, History>;
};

export const cacheAtom = atom<Cache>({
  key: "cacheAtom",
  default: {
    ranges: [],
    histories: {},
  },
});

// @todo: implement with recoil snapshots or st.
export const WithCache = memo(() => {
  const range = useRecoilValue(rangeAtom);
  const entities = useRecoilValue(EntitiesAtom);
  const hass = useRecoilValue(HassAtom);
  let setCache = useSetRecoilState(cacheAtom);
  const promise = useRef(Promise.resolve());
  const updatedData = useRef({ range, entities });
  updatedData.current = { range, entities };
  const lastCacheRef = useRef<Cache>({
    // @TODO: find way to avoid this hack that solves the cyclic dependency
    ranges: [],
    histories: {},
  });

  useEffect(() => {
    if (!hass) return;
    console.log("fetchiing");
    const fetch = async () => {
      const { range, entities } = updatedData.current;
      const entityNames = entities.map(({ entity }) => entity) || [];
      let cache = lastCacheRef.current;
      if (
        JSON.stringify(Object.keys(cache.histories)) !=
        JSON.stringify(entityNames)
      ) {
        // entity names changed, clear cache
        cache = {
          ranges: [],
          histories: {},
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
          // @TODO: hass doesn't return an empty array for empty histories, so data is out of order!!!!
          console.log("added:", r[0]?.length);
          console.log(
            start.toTimeString().split(" ")[0] +
              "-" +
              end.toTimeString().split(" ")[0]
          );
          return r.map((history) =>
            history?.map((entry) => ({
              ...entry,
              last_changed: new Date(entry.last_changed),
            }))
          );
        })
      );

      const histories: Cache["histories"] = {};
      entityNames.forEach((name, i) => {
        histories[name] = cache.histories[name]?.slice() || [];
        for (const history of fetchedHistories) {
          history[i] = history[i] || [];
          histories[name] = [...histories[name], ...history[i]];
        }
      });
      let lastKnwonTimestamp = 0;
      entityNames.forEach((name) => {
        histories[name].sort(
          (a, b) => a.last_changed.getTime() - b.last_changed.getTime()
        );
        const timestamp = +histories[name].slice(-1)[0].last_changed + 1;
        lastKnwonTimestamp = Math.max(lastKnwonTimestamp, timestamp);
      });

      let ranges = [...cache.ranges, ...rangesToFetch];
      var MAX_TIMESTAMP = 8640000000000000;
      ranges = subtractRanges(ranges, [
        [new Date(lastKnwonTimestamp), new Date(MAX_TIMESTAMP)],
      ]);

      const newCache = {
        ranges: compactRanges(ranges),
        histories,
        entityNames,
      };
      lastCacheRef.current = newCache;
      setCache(newCache);
    };
    promise.current = promise.current.then(fetch);
  }, [{}]);
  return <></>;
});

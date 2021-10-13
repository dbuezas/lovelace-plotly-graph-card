import { useCallback, useEffect, useState } from "preact/hooks";
import { HomeAssistant } from "custom-card-helpers"; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers
import { Config, DateRange } from "./types";
import { Cache, addToCache } from "./cache";

function isString(s: any): s is string {
  return typeof s == "string";
}
function uniq(arr: any[]) {
  return Array.from(new Set(arr));
}

const useHistory = (
  hass: HomeAssistant | undefined,
  config: Config,
  range: DateRange
) => {
  const [cache, setCache] = useState<Cache>({
    ranges: [],
    histories: {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const asEntities = config.entities?.map(({ entity }) => entity) || [];
  const asTraces = config.traces?.flatMap(({ x, y, z }) => [x, y, z]) || [];
  const entityNames = uniq([...asEntities, ...asTraces].filter(isString));
  useEffect(() => {
    if (!hass) return;
    const fetch = async () => {
      setIsLoading(true);
      setCache(await addToCache(cache, range, hass, entityNames));
      setIsLoading(false);
    };
    fetch();
  }, [!!hass, range, entityNames.toString()]);
  return { history: cache.histories, isLoading };
};

export const useData = (
  hass: HomeAssistant | undefined,
  config: Config,
  range: DateRange
) => {
  const { history, isLoading } = useHistory(hass, config, range);
  const [data, setData] = useState<Plotly.Data[]>([]);
  useEffect(() => {
    if (config.entities) {
      const data: Plotly.Data[] = config.entities.map((trace, i) => {
        const name = trace.entity;
        return {
          name,
          ...trace,
          x: history[name]?.map(({ last_changed }) => last_changed),
          y: history[name]?.map(({ state }) => state),
        };
      });
      setData(data);
    }
    if (config.traces) {
      const data: Plotly.Data[] = config.traces.map((trace, i) => {
        const dates = Array.from(
          new Set(
            [
              ...(history[trace.x!]?.map(({ last_changed }) => last_changed) ||
                []),
              ...(history[trace.y!]?.map(({ last_changed }) => last_changed) ||
                []),
              ...(history[trace.z!]?.map(({ last_changed }) => last_changed) ||
                []),
            ].filter(Boolean)
          )
        ).sort();

        const h = {
          x: (history[trace.x!] || []).slice(),
          y: (history[trace.y!] || []).slice(),
          z: (history[trace.z!] || []).slice(),
        };
        const index = {
          x: 0,
          y: 0,
          z: 0,
        };
        const last = {
          x: undefined as string | undefined,
          y: undefined as string | undefined,
          z: undefined as string | undefined,
        };
        const axes = {
          x: [] as (string | undefined)[],
          y: [] as (string | undefined)[],
          z: [] as (string | undefined)[],
        };
        for (const date of dates) {
          if (h.x[index.x]?.last_changed === date) {
            last.x = h.x[index.x].state;
            index.x++;
          }
          if (h.y[index.y]?.last_changed === date) {
            last.y = h.y[index.y].state;
            index.y++;
          }
          if (h.z[index.z]?.last_changed === date) {
            last.z = h.z[index.z].state;
            index.z++;
          }
          axes.x.push(last.x);
          axes.y.push(last.y);
          axes.z.push(last.z);
        }
        const result = {
          ...trace,
          x: trace.x === "dates" ? dates : axes.x,
          y: trace.y === "dates" ? dates : axes.y,
          z: trace.z === "dates" ? dates : axes.z,
        };
        console.log(result);
        return result;
      });
      setData(data);
    }
  }, [history, JSON.stringify(config.entities)]);
  return { data, isLoading };
};

export const useWidth = (element: HTMLDivElement | null) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element) return;
    const updateWidth = () => {
      setWidth(element.offsetWidth);
    };
    const observer = new ResizeObserver(updateWidth);
    updateWidth();
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return width;
};

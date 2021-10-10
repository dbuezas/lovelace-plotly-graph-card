import { useCallback, useEffect, useState } from "preact/hooks";
import { HomeAssistant } from "custom-card-helpers"; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers
import { Config, DateRange } from "./types";
import { Cache, addToCache } from "./cache";

const useHistory = (
  hass: HomeAssistant | undefined,
  config: Config,
  range: DateRange
) => {
  const [cache, setCache] = useState<Cache>({
    ranges: [],
    histories: [],
    entityNames: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const entityNames = config.entities.flatMap(({ entity }) => [entity]);
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
    const data: Plotly.Data[] = history.map((trace, i) => ({
      x: trace.map(({ last_changed }) => last_changed),
      y: trace.map(({ state }) => state),
      name: trace[0].attributes.friendly_name,
      ...config.entities[i],
    }));
    setData(data);
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

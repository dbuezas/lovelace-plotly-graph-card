import { useEffect, useRef, useState } from "preact/hooks";
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
    histories: {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const entityNames = config.entities?.map(({ entity }) => entity) || [];
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
    const data: Plotly.Data[] = config.entities.map((trace) => {
      const name = trace.entity;
      return {
        name,
        ...trace,
        x: history[name]?.map(({ last_changed }) => last_changed),
        y: history[name]?.map(({ state }) => state),
      };
    });
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

import { useEffect, useState } from "preact/hooks";
import { HomeAssistant } from "custom-card-helpers"; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers
import sub from "date-fns/sub";
import { Config, History, Range } from "./types";

const useHistory = (
  hass: HomeAssistant | undefined,
  config: Config,
  range: Range
) => {
  const [history, setHistory] = useState<History[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const entityNames = config.entities.map(({ entity }) => entity);
  useEffect(() => {
    if (!hass) return;
    const fetch = async () => {
      setIsLoading(true);
      const startDate = range[0]
        ? new Date(range[0] + "Z")
        : sub(new Date(), { hours: config.hours_to_show });
      const endDate = range[1] ? new Date(range[1] + "Z") : new Date();
      const uri =
        `history/period/${startDate.toISOString()}?` +
        `filter_entity_id=${entityNames}&` +
        `significant_changes_only=1&` +
        `minimal_response&end_time=${endDate.toISOString()}`;
      console.log("hass", hass);

      const history: History[] = (await hass.callApi("GET", uri)) || [];
      console.log(uri, history);
      setHistory(history);
      setIsLoading(false);
    };
    fetch();
  }, [!!hass, range, entityNames.toString(), config.hours_to_show]);
  return { history, isLoading };
};

export const useData = (
  hass: HomeAssistant | undefined,
  config: Config,
  range: Range
) => {
  const { history, isLoading } = useHistory(hass, config, range);
  const [data, setData] = useState<Plotly.Data[]>([]);
  useEffect(() => {
    console.log("reData");
    const data: Plotly.Data[] = history.map((entity, i) => ({
      x: entity.map(({ last_changed }) => last_changed),
      y: entity.map(({ state }) => state),
      name: entity[0].attributes.friendly_name,
      type: "scatter",
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

import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import Plotly from "./plotly";
import { HomeAssistant } from "custom-card-helpers"; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers
import * as themes from "./themes";
import StyleHack from "./StyleHack";
import merge from "lodash-es/merge";
import { useData, useWidth } from "./hooks";
import { Config, DateRange } from "./types";
import sub from "date-fns/sub";

declare module "preact/src/jsx" {
  namespace JSXInternal {
    interface IntrinsicElements {
      "ha-card": any;
    }
  }
}

const extractRanges = (layout: Partial<Plotly.Layout>) => {
  const justRanges: Partial<Plotly.Layout> = {};
  Object.keys(layout).forEach((key) => {
    if (layout[key]?.range) {
      justRanges[key] ??= {};
      justRanges[key].range = layout[key].range;
    }
    if (layout[key]?.autorange) {
      justRanges[key] ??= {};
      justRanges[key].autorange = layout[key].autorange;
    }
  });
  return justRanges;
};
type Props = {
  hass?: HomeAssistant;
  config: Config;
};
const Plotter = ({ config, hass }: Props) => {
  const layoutRef = useRef<Partial<Plotly.Layout>>({});
  const container = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<DateRange>([new Date(), new Date()]);
  const { data, isLoading } = useData(hass, config, range);
  const width = useWidth(container.current);
  useEffect(() => {
    const refresh_interval = Number(config.refresh_interval);
    if (refresh_interval > 0) {
      console.log("refresh_interval", refresh_interval);
      const timeout = setTimeout(() => {
        console.log("refreshing");
        const minutes = Number(config.hours_to_show) * 60; // if add hours is used, decimals are ignored
        setRange([sub(new Date(), { minutes }), new Date()]);
      }, refresh_interval * 1000);
      return () => clearTimeout(timeout);
    }
    return;
  }, [range, config.refresh_interval, config.hours_to_show]);
  useEffect(() => {
    const minutes = Number(config.hours_to_show) * 60; // if add hours is used, decimals are ignored
    setRange([sub(new Date(), { minutes }), new Date()]);
  }, [config.hours_to_show]);
  useEffect(() => {
    if (!container.current || width === 0) return;
    const element = container.current;
    console.log("layoutRef.current", layoutRef.current);
    layoutRef.current = merge(
      extractRanges(layoutRef.current),
      themes[config.theme!] || themes.dark,
      config.layout,
      {
        width,
      }
    );
    layoutRef.current.title = isLoading
      ? {
          text: "Loading...",
          xanchor: "center",
          yanchor: "top",
          y: 0.9,
          font: { size: 20 },
        }
      : undefined;

    Plotly.react(element, data, layoutRef.current);
    const zoomCallback = (eventdata) => {
      if (eventdata["xaxis.showspikes"] === false) {
        // user clicked the home icon
        const minutes = Number(config.hours_to_show) * 60; // if add hours is used, decimals are ignored
        setRange([sub(new Date(), { minutes }), new Date()]);
      }
      if (eventdata["xaxis.range[0]"]) {
        setRange([
          new Date(eventdata["xaxis.range[0]"]),
          new Date(eventdata["xaxis.range[1]"]),
        ]);
      }
    };
    const eventEmmitter = (element as any).on("plotly_relayout", zoomCallback);
    return () => eventEmmitter.off("plotly_relayout", zoomCallback);
  }, [
    config.theme,
    config.hours_to_show,
    width,
    isLoading,
    data,
    container.current,
    JSON.stringify(config.layout),
  ]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    try {
      Plotly.relayout(element, {
        // 'yaxis.range': TODO:
        "xaxis.range": range,
      });
    } catch (e) {}
  }, [range, container.current]);
  return (
    <ha-card>
      <StyleHack />
      <div ref={container}></div>
    </ha-card>
  );
};

export default Plotter;

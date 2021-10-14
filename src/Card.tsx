import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import Plotly from "./plotly";
import { HomeAssistant } from "custom-card-helpers"; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers
import * as themes from "./themes";
import StyleHack from "./StyleHack";
import merge from "lodash-es/merge";
import { dataAtom, useWidth, isLoadingAtom, rangeAtom } from "./hooks";
import { Config, DateRange } from "./types";
import sub from "date-fns/sub";
import {
  atom,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { WithCache } from "./cache";

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

export const EntitiesAtom = atom<Config["entities"]>({
  key: "ConfigEntitiesAtom",
  default: [],
});
export const HassAtom = atom<HomeAssistant | undefined>({
  key: "HassAtom",
  default: undefined,
  dangerouslyAllowMutability: true,
});

const Plotter = ({ config, hass }: Props) => {
  config = JSON.parse(JSON.stringify(config));
  const [entities, setEntities] = useRecoilState(EntitiesAtom);
  if (JSON.stringify(config.entities) !== JSON.stringify(entities))
    setEntities(config.entities);
  const [storedHass, setStoredHass] = useRecoilState(HassAtom);
  if (!storedHass && hass) setStoredHass(hass);

  const layoutRef = useRef<Partial<Plotly.Layout>>({});
  const container = useRef<HTMLDivElement>(null);
  const width = useWidth(container.current);
  const [range, setRange] = useRecoilState(rangeAtom);
  useEffect(() => {
    const minutes = Number(config.hours_to_show) * 60; // if add hours is used, decimals are ignored
    setRange([sub(new Date(), { minutes }), new Date()]);
  }, []);
  const isLoading = useRecoilValue(isLoadingAtom);
  const data = useRecoilValue(dataAtom);
  const resetRange = useCallback(() => {
    const minutes = Number(config.hours_to_show) * 60; // if add hours is used, decimals are ignored
    setRange([sub(new Date(), { minutes }), new Date()]);
  }, [container.current, config.hours_to_show]);
  useEffect(() => {
    const refresh_interval = Number(config.refresh_interval);
    if (refresh_interval > 0) {
      console.log("refresh_interval", refresh_interval);
      const timeout = setTimeout(resetRange, refresh_interval * 1000);
      return () => clearTimeout(timeout);
    }
    return;
  }, [range, config.refresh_interval, config.hours_to_show]);
  useEffect(resetRange, [config.hours_to_show]);
  useEffect(() => {
    if (!container.current || width === 0) return;
    const element = container.current;
    layoutRef.current = merge(
      extractRanges(layoutRef.current),
      themes[config.theme!] || themes.dark,
      config.layout,
      { width }
    );
    layoutRef.current.title = isLoading
      ? {
          text: "Loading...",
          xanchor: "center",
          yanchor: "top",
          // y: 0.9,
          font: { size: 20 },
        }
      : undefined;

    Plotly.react(element, data, layoutRef.current, {
      displaylogo: false,
      ...config.config,
    });
    const zoomCallback = (eventdata) => {
      if (eventdata["xaxis.showspikes"] === false) {
        // user clicked the home icon
        resetRange();
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
    width,
    isLoading,
    data,
    container.current,
    JSON.stringify(config.layout),
    JSON.stringify(config.config),
  ]);
  useEffect(() => {
    if (!container.current) return;
    try {
      Plotly.relayout(container.current, {
        // 'yaxis.range': TODO:
        "xaxis.range": range.slice(),
      });
    } catch (e) {}
  }, [range, container.current]);
  return (
    <ha-card>
      <StyleHack />
      <WithCache />
      <div ref={container}></div>
    </ha-card>
  );
};

export default Plotter;

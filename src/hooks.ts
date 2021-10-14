import { useEffect, useState } from "preact/hooks";
import { DateRange } from "./types";
import { cacheAtom } from "./cache";

import { atom, selector } from "recoil";
import { EntitiesAtom } from "./Card";

export const isLoadingAtom = atom({
  key: "isLoadingAtom",
  default: false,
});

export const rangeAtom = atom<DateRange>({
  key: "rangeAtom",
  default: [new Date(), new Date()],
});

export const dataAtom = selector<Plotly.Data[]>({
  key: "dataAtom",
  get: ({ get }) => {
    const entities = get(EntitiesAtom);
    const { histories } = get(cacheAtom);

    const data: Plotly.Data[] = entities.map((trace) => {
      const name = trace.entity;
      return {
        name,
        ...trace,
        x: histories[name]?.map(({ last_changed }) => last_changed),
        y: histories[name]?.map(({ state }) => state),
      };
    });
    return data;
  },
});

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

export type Config = {
  hours_to_show: number;
  theme: string;
  traces: ({
    x?: string;
    y?: string;
    z?: string;
    entity?: string;
  } & Partial<Plotly.PlotData>)[];
  layout?: Partial<Plotly.Layout>;
};

export type History = {
  last_changed: string;
  state: string;
  attributes: {
    friendly_name: string;
  };
}[];
export type Range = [string | undefined, string | undefined];

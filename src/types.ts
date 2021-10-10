export type Config = {
  type: "custom:plotly-graph-card";
  hours_to_show?: number;
  theme?: string;
  refresh_interval?: number; // in seconds
  entities: ({
    entity: string;
  } & Partial<Plotly.PlotData>)[];
  layout?: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
};

export type History = {
  last_changed: Date;
  state: string;
  attributes: {
    friendly_name: string;
  };
}[];
export type DateRange = [Date, Date];

export type Config = {
  type: "custom:plotly-graph-card";
  hours_to_show?: number;
  theme?: string;
  refresh_interval?: number; // in seconds
  entities: (Partial<Plotly.PlotData> & {
    entity: string;
  })[];
  layout?: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
};
export type Timestamp = number;
export type History = {
  entity_id: string;
  last_changed: Timestamp;
  state: string;
  attributes: {
    friendly_name: string;
    unit_of_measurement: string;
  };
}[];
export type TimestampRange = Timestamp[]; // [Timestamp, Timestamp];

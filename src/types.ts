import { Datum } from "plotly.js";
import { ColorSchemeNames } from "./color-schemes";

export type InputConfig = {
  type: "custom:plotly-graph-card";
  hours_to_show?: number;
  refresh_interval?: number; // in seconds
  color_scheme?: ColorSchemeNames;
  title?: string;
  entities: (Partial<Plotly.PlotData> & {
    entity: string;
    unit_of_measurement?: string;
    lambda?: string;
    show_value?: boolean | {
      right_margin: number
    };
  })[];
  defaults?: {
    entity?: Partial<Plotly.PlotData>,
    yaxis?: Partial<Plotly.Layout["yaxis"]>,
  }
  layout?: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
  no_theme?: boolean;
  no_default_layout?: boolean;
};
export type Config = {
  hours_to_show: number;
  refresh_interval: number; // in seconds
  entities: (Partial<Plotly.PlotData> & {
    entity: string;
    unit_of_measurement?: string;
    lambda?: (y: Datum[], x: Date[], raw_entity: History) => Datum[] | {x?:Datum[], y?:Datum[]};
    show_value: boolean | {
      right_margin: number
    };
  })[];
  layout: Partial<Plotly.Layout>;
  config: Partial<Plotly.Config>;
  no_theme: boolean;
  no_default_layout: boolean;
};
export type Timestamp = number;
export type History = {
  entity_id: string;
  last_changed: Timestamp;
  last_updated: Timestamp;
  state: string;
  attributes: {
    friendly_name?: string;
    unit_of_measurement?: string;
  };
}[];
export type TimestampRange = Timestamp[]; // [Timestamp, Timestamp];

export type HATheme = {
  "--card-background-color": string;
  "--primary-background-color": string;
  "--primary-color": string;
  "--primary-text-color": string;
  "--secondary-text-color": string;
};

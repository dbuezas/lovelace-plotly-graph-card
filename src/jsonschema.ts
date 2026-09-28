import { InputConfig, InputEntityOptions } from "./types";

type With$fn<T> = {
  [K in keyof T]:
    | (T[K] extends (infer U)[] // Handle arrays recursively
        ? With$fn<U>[]
        : With$fn<T[K]>) // Handle everything else recursively
    | `${string}$ex$fn_REPLACER`; // Apply extension to everything
};

type PlotlySchemaPlaceholder = Record<string, unknown>;

type JsonSchemaInputConfig = Omit<
  InputConfig,
  "config" | "defaults" | "entities" | "layout"
> & {
  config?: PlotlySchemaPlaceholder;
  defaults?: {
    entity?: PlotlySchemaPlaceholder;
    xaxes?: PlotlySchemaPlaceholder;
    yaxes?: PlotlySchemaPlaceholder;
  };
  entities: InputEntityOptions[];
  layout?: PlotlySchemaPlaceholder;
};

export type JsonSchemaRoot = With$fn<JsonSchemaInputConfig>;

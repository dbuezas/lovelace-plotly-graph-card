import { InputConfig, InputEntityOptions } from "./types";

type $fnString = `${string}$ex$fn_REPLACER`;

type With$fn<T> = {
  [K in keyof T]:
    | (NonNullable<T[K]> extends Function // Functions can only be $fn/$ex strings
        ? $fnString
        : T[K] extends (infer U)[] // Handle arrays recursively
          ? With$fn<U>[]
          : With$fn<T[K]>) // Handle everything else recursively
    | $fnString; // Apply extension to everything
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

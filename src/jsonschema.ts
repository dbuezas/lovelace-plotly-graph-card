import { InputConfig } from "./types";

type With$fn<T> = {
  [K in keyof T]:
    | (T[K] extends (infer U)[] // Handle arrays recursively
        ? With$fn<U>[]
        : With$fn<T[K]>) // Handle everything else recursively
    | `${string}$ex$fn_REPLACER`; // Apply extension to everything
};

export type JsonSchemaRoot = With$fn<InputConfig>;

import { InputConfig } from "./types";

type With$fn<T> = {
  [K in keyof T]:
    | (T[K] extends (infer U)[]
        ? With$fn<U>[] // handle arrays recursively
        : T[K] extends object
          ? With$fn<T[K]> // handle objects recursively
          : T[K]) // retain original type
    | `${string}$ex$fn_REPLACER`;
};

export type JsonSchemaRoot = With$fn<InputConfig>;

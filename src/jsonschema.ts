import { InputConfig } from "./types";

type Whitespace = " " | "\t" | "\n" | "\r";

type With$fn<T> = {
  [K in keyof T]:
    | (T[K] extends (infer U)[]
        ? With$fn<U>[] // handle arrays recursively
        : T[K] extends object
          ? With$fn<T[K]> // handle objects recursively
          : T[K]) // retain original type
    | `${Whitespace | ""}$ex${Whitespace}${string}`
    | `${Whitespace | ""}$fn${Whitespace}${string}`; // allow string starting with $ex or $fn with optional whitespace
};

export type JsonSchemaRoot = With$fn<InputConfig>;

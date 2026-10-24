import "./global-shim";
const Plotly = require("plotly.js/lib/core") as typeof import("plotly.js");

// Plotly's core has scatter; bar is small and common, so it is included too.
// Other trace types are loaded in groups the first time a card needs them, and
// so are locales and calendars.
Plotly.register([require("plotly.js/lib/bar")]);

type Loader = () => Promise<{ default: unknown }>;
const groups: Record<string, Loader> = {
  pie: () => import("./plotly-traces/pie"),
  charts2d: () => import("./plotly-traces/charts2d"),
  hierarchy: () => import("./plotly-traces/hierarchy"),
  gl2d: () => import("./plotly-traces/gl2d"),
  gl3d: () => import("./plotly-traces/gl3d"),
  geo: () => import("./plotly-traces/geo"),
  map: () => import("./plotly-traces/map"),
  image: () => import("./plotly-traces/image"),
};
const groupOf: Record<string, string> = {
  box: "charts2d",
  violin: "charts2d",
  histogram: "charts2d",
  histogram2d: "charts2d",
  histogram2dcontour: "charts2d",
  heatmap: "charts2d",
  contour: "charts2d",
  funnel: "charts2d",
  waterfall: "charts2d",
  ohlc: "charts2d",
  candlestick: "charts2d",
  carpet: "charts2d",
  scattercarpet: "charts2d",
  contourcarpet: "charts2d",
  indicator: "charts2d",
  table: "charts2d",
  pie: "pie",
  funnelarea: "pie",
  parcats: "charts2d",
  scatterpolar: "charts2d",
  barpolar: "charts2d",
  scatterternary: "charts2d",
  scattersmith: "charts2d",
  image: "image",
  quiver: "charts2d",
  sunburst: "hierarchy",
  treemap: "hierarchy",
  icicle: "hierarchy",
  sankey: "hierarchy",
  scattergl: "gl2d",
  splom: "gl2d",
  parcoords: "gl2d",
  scatterpolargl: "gl2d",
  scatter3d: "gl3d",
  surface: "gl3d",
  isosurface: "gl3d",
  volume: "gl3d",
  mesh3d: "gl3d",
  cone: "gl3d",
  streamtube: "gl3d",
  scattergeo: "geo",
  choropleth: "geo",
  scattermap: "map",
  choroplethmap: "map",
  densitymap: "map",
};
const locales: Record<string, Loader> = {
  af: () => import("plotly.js/lib/locales/af.js"),
  am: () => import("plotly.js/lib/locales/am.js"),
  "ar-dz": () => import("plotly.js/lib/locales/ar-dz.js"),
  "ar-eg": () => import("plotly.js/lib/locales/ar-eg.js"),
  ar: () => import("plotly.js/lib/locales/ar.js"),
  az: () => import("plotly.js/lib/locales/az.js"),
  bg: () => import("plotly.js/lib/locales/bg.js"),
  bs: () => import("plotly.js/lib/locales/bs.js"),
  ca: () => import("plotly.js/lib/locales/ca.js"),
  cs: () => import("plotly.js/lib/locales/cs.js"),
  cy: () => import("plotly.js/lib/locales/cy.js"),
  da: () => import("plotly.js/lib/locales/da.js"),
  "de-ch": () => import("plotly.js/lib/locales/de-ch.js"),
  de: () => import("plotly.js/lib/locales/de.js"),
  el: () => import("plotly.js/lib/locales/el.js"),
  eo: () => import("plotly.js/lib/locales/eo.js"),
  "es-ar": () => import("plotly.js/lib/locales/es-ar.js"),
  "es-pe": () => import("plotly.js/lib/locales/es-pe.js"),
  es: () => import("plotly.js/lib/locales/es.js"),
  et: () => import("plotly.js/lib/locales/et.js"),
  eu: () => import("plotly.js/lib/locales/eu.js"),
  fa: () => import("plotly.js/lib/locales/fa.js"),
  fi: () => import("plotly.js/lib/locales/fi.js"),
  fo: () => import("plotly.js/lib/locales/fo.js"),
  "fr-ch": () => import("plotly.js/lib/locales/fr-ch.js"),
  fr: () => import("plotly.js/lib/locales/fr.js"),
  gl: () => import("plotly.js/lib/locales/gl.js"),
  gu: () => import("plotly.js/lib/locales/gu.js"),
  he: () => import("plotly.js/lib/locales/he.js"),
  "hi-in": () => import("plotly.js/lib/locales/hi-in.js"),
  hr: () => import("plotly.js/lib/locales/hr.js"),
  hu: () => import("plotly.js/lib/locales/hu.js"),
  hy: () => import("plotly.js/lib/locales/hy.js"),
  id: () => import("plotly.js/lib/locales/id.js"),
  is: () => import("plotly.js/lib/locales/is.js"),
  it: () => import("plotly.js/lib/locales/it.js"),
  ja: () => import("plotly.js/lib/locales/ja.js"),
  ka: () => import("plotly.js/lib/locales/ka.js"),
  km: () => import("plotly.js/lib/locales/km.js"),
  ko: () => import("plotly.js/lib/locales/ko.js"),
  lt: () => import("plotly.js/lib/locales/lt.js"),
  lv: () => import("plotly.js/lib/locales/lv.js"),
  "me-me": () => import("plotly.js/lib/locales/me-me.js"),
  me: () => import("plotly.js/lib/locales/me.js"),
  mk: () => import("plotly.js/lib/locales/mk.js"),
  ml: () => import("plotly.js/lib/locales/ml.js"),
  ms: () => import("plotly.js/lib/locales/ms.js"),
  mt: () => import("plotly.js/lib/locales/mt.js"),
  "nl-be": () => import("plotly.js/lib/locales/nl-be.js"),
  nl: () => import("plotly.js/lib/locales/nl.js"),
  no: () => import("plotly.js/lib/locales/no.js"),
  pa: () => import("plotly.js/lib/locales/pa.js"),
  pl: () => import("plotly.js/lib/locales/pl.js"),
  "pt-br": () => import("plotly.js/lib/locales/pt-br.js"),
  "pt-pt": () => import("plotly.js/lib/locales/pt-pt.js"),
  rm: () => import("plotly.js/lib/locales/rm.js"),
  ro: () => import("plotly.js/lib/locales/ro.js"),
  ru: () => import("plotly.js/lib/locales/ru.js"),
  si: () => import("plotly.js/lib/locales/si.js"),
  sk: () => import("plotly.js/lib/locales/sk.js"),
  sl: () => import("plotly.js/lib/locales/sl.js"),
  sq: () => import("plotly.js/lib/locales/sq.js"),
  "sr-sr": () => import("plotly.js/lib/locales/sr-sr.js"),
  sr: () => import("plotly.js/lib/locales/sr.js"),
  sv: () => import("plotly.js/lib/locales/sv.js"),
  sw: () => import("plotly.js/lib/locales/sw.js"),
  ta: () => import("plotly.js/lib/locales/ta.js"),
  th: () => import("plotly.js/lib/locales/th.js"),
  tr: () => import("plotly.js/lib/locales/tr.js"),
  tt: () => import("plotly.js/lib/locales/tt.js"),
  uk: () => import("plotly.js/lib/locales/uk.js"),
  ur: () => import("plotly.js/lib/locales/ur.js"),
  vi: () => import("plotly.js/lib/locales/vi.js"),
  "zh-cn": () => import("plotly.js/lib/locales/zh-cn.js"),
  "zh-hk": () => import("plotly.js/lib/locales/zh-hk.js"),
  "zh-tw": () => import("plotly.js/lib/locales/zh-tw.js"),
};
const calendars: Loader = () => import("plotly.js/lib/calendars");

// Home Assistant language codes that Plotly names differently
const localeAliases: Record<string, string> = {
  "zh-hans": "zh-cn",
  "zh-hant": "zh-tw",
  "sr-latn": "sr-sr",
  nb: "no",
  nn: "no",
  pt: "pt-pt",
  hi: "hi-in",
  gsw: "de-ch",
};
// Key of the Plotly locale file for a language, if there is one
const localeKey = (language: string) => {
  const code = language.toLowerCase();
  const key =
    localeAliases[code] ?? (locales[code] ? code : code.split("-")[0]);
  return locales[key] ? key : undefined;
};

const loaded: Record<string, Promise<void>> = {};
const load = (key: string, loader?: Loader) =>
  loader &&
  (loaded[key] ??= loader().then((m) => Plotly.register(m.default as any)));

// Calendar attributes are top level in traces, and anywhere in the layout
const usesCalendar = (obj: object, deep: boolean): boolean =>
  Object.entries(obj).some(
    ([key, value]) =>
      key.endsWith("calendar") ||
      (deep && value?.constructor === Object && usesCalendar(value, deep)),
  );

// Loads what the plot needs and returns the locale name to give Plotly
// Loads what the plot needs and returns the locale name to give Plotly
export const loadPlotlyModules = async (
  data: { type?: string }[],
  layout: object,
  language = "",
) => {
  const key = language ? localeKey(language) : undefined;
  const base = key?.split("-")[0];
  await Promise.all([
    ...data.map(({ type = "scatter" }) => {
      const group = groupOf[type];
      return group && load(group, groups[group]);
    }),
    // Regional locales (e.g. de-ch) only have formats, the texts are in the base
    base && base !== key && load(base, locales[base]),
    key && load(key, locales[key]),
    // Surface uses calendar defaults to convert date and category coordinates.
    (usesCalendar(layout, true) ||
      data.some((t) => t.type === "surface" || usesCalendar(t, false))) &&
      load("calendars", calendars),
  ]);
  // Plotly finds locales by their registered name, e.g. "pt-BR"
  return key
    ? key.replace(/-\w+$/, (region) => region.toUpperCase())
    : language || undefined;
};

type GraphWithMargins = Plotly.PlotlyHTMLElement & {
  _fullLayout?: Partial<Plotly.Layout> & {
    _size?: Record<"l" | "r" | "t" | "b" | "p" | "w" | "h", number>;
  };
};

export async function reactWithMarginFix(
  graph: GraphWithMargins,
  data: Plotly.Data[],
  layout: Partial<Plotly.Layout>,
  config: Partial<Plotly.Config>,
) {
  const previous = graph._fullLayout?._size && {
    ...graph._fullLayout._size,
  };
  const result = await Plotly.react(graph, data, layout, config);
  const current = graph._fullLayout?._size;
  const plots = require("plotly.js/src/plots/plots");
  // Plotly 4.1.2 can leave margin pushers positioned at the old margins (#723).
  // Rerun its own positioning pass, not another data/axes render.
  if (previous && current && plots.didMarginChange(previous, current)) {
    require("plotly.js/src/plot_api/subroutines").drawMarginPushers(graph);
    await plots.previousPromises(graph);
  }
  return result;
}

// Nulling only the off-screen values keeps every X coordinate, so Plotly still
// calculates the same automatic bar widths, groups, offsets and period alignment.
export function getVisibleStatisticsBars(
  graph: Plotly.PlotlyHTMLElement,
  data: Plotly.Data[],
): Plotly.Data[] | undefined {
  type Axis = {
    type: string;
    range: unknown[];
    r2l: (value: unknown) => number;
  };
  const native = graph as Plotly.PlotlyHTMLElement & {
    _fullLayout: Partial<Plotly.Layout> & Record<string, Axis>;
    _fullData: {
      visible: unknown;
      type: string;
      orientation?: string;
      xaxis: string;
      yaxis: string;
    }[];
    calcdata: { p?: number; p0?: number; p1?: number }[][];
  };
  const rangeOf = (axisId: string) => {
    const axis = native._fullLayout[`xaxis${axisId.slice(1)}`];
    return axis?.type === "date"
      ? axis.range.map((value) => axis.r2l(value)).sort((a, b) => a - b)
      : undefined;
  };
  const overlaps = (bar: { p0?: number; p1?: number }, range: number[]) =>
    bar.p0 === undefined ||
    bar.p1 === undefined ||
    (Math.max(bar.p0, bar.p1) > range[0] &&
      Math.min(bar.p0, bar.p1) < range[1]);
  const visibleStacks = new Set<string>();
  if (
    native._fullLayout.barnorm ||
    ["stack", "relative"].includes(native._fullLayout.barmode ?? "")
  ) {
    // A clipped bar can still determine a visible bar's stack base or percentage.
    native.calcdata.forEach((bars, index) => {
      const trace = native._fullData[index];
      if (
        trace?.type !== "bar" ||
        trace.visible !== true ||
        trace.orientation === "h"
      )
        return;
      const range = rangeOf(trace.xaxis);
      if (range)
        for (const bar of bars) {
          if (overlaps(bar, range))
            visibleStacks.add(`${trace.xaxis}|${trace.yaxis}|${bar.p}`);
        }
    });
  }
  let changed = false;
  const visible = data.map((trace, index) => {
    const fullTrace = native._fullData[index];
    if (
      trace.type !== "bar" ||
      (!("statistic" in trace && trace.statistic) &&
        !("period" in trace && trace.period)) ||
      fullTrace?.visible !== true ||
      fullTrace.orientation === "h"
    )
      return trace;
    const range = rangeOf(fullTrace.xaxis);
    if (!range) return trace;
    const values = trace.y;
    if (!values || Array.isArray(values[0])) return trace;
    let masked = false;
    const y = Array.from(values as ArrayLike<Plotly.Datum>, (value, i) => {
      const bar = native.calcdata[index]?.[i];
      if (bar?.p0 === undefined || bar.p1 === undefined || value === null)
        return value;
      if (
        overlaps(bar, range) ||
        visibleStacks.has(`${fullTrace.xaxis}|${fullTrace.yaxis}|${bar.p}`)
      )
        return value;
      masked = true;
      return null;
    });
    changed ||= masked;
    return masked ? { ...trace, y } : trace;
  });
  return changed ? visible : undefined;
}

export default Plotly;

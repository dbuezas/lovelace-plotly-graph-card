import "./global-shim";
const Plotly = require("plotly.js/lib/core") as typeof import("plotly.js");

// Plotly's core has scatter; bar is small and common, so it is included too.
// Other trace types are loaded in groups the first time a card needs them, and
// so are locales and calendars.
Plotly.register([require("plotly.js/lib/bar")]);

type Loader = () => Promise<{ default: unknown }>;
const groups: Record<string, Loader> = {
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
  pie: "charts2d",
  funnelarea: "charts2d",
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
const plotlyLocale = (language: string) => {
  const code = language.toLowerCase();
  const base = code.split("-")[0];
  if (localeAliases[code]) return localeAliases[code];
  return locales[code] ? code : locales[base] ? base : language;
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
      (deep && value?.constructor === Object && usesCalendar(value, deep))
  );

// Loads what the plot needs and returns the locale name to give Plotly
export const loadPlotlyModules = async (
  data: { type?: string }[],
  layout: object,
  language = ""
) => {
  const locale = language ? plotlyLocale(language) : undefined;
  await Promise.all([
    ...data.map(({ type = "scatter" }) => {
      const group = groupOf[type];
      return group && load(group, groups[group]);
    }),
    locale && load(locale, locales[locale]),
    (usesCalendar(layout, true) || data.some((t) => usesCalendar(t, false))) &&
      load("calendars", calendars),
  ]);
  return locale;
};

export default Plotly;

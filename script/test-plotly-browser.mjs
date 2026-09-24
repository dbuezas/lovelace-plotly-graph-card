import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

const assets = new Map();
for (const [name, entry] of [
  ["PlotlyTest", "src/plotly.ts"],
  ["DefaultsTest", "src/parse-config/defaults.ts"],
  ["CardTest", "src/plotly-graph-card.ts"],
]) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "iife",
    globalName: name,
    outdir: "dist",
    minify: true,
  });
  assets.set(
    `/${name}.js`,
    result.outputFiles.find((file) => file.path.endsWith(".js")).text,
  );
  const stylesheet = result.outputFiles.find((file) =>
    file.path.endsWith(".css"),
  );
  if (stylesheet) assets.set(`/${name}.css`, stylesheet.text);
}
const server = createServer((request, response) => {
  response.setHeader(
    "Content-Type",
    request.url.endsWith(".js")
      ? "text/javascript"
      : request.url.endsWith(".css")
        ? "text/css"
        : "text/html",
  );
  response.end(
    assets.get(request.url) ||
      `<!doctype html><link rel="stylesheet" href="/PlotlyTest.css"><body>
    <script src="/PlotlyTest.js"></script><script src="/DefaultsTest.js"></script>
    <script src="/CardTest.js"></script></body>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({
    viewport: { width: 1000, height: 800 },
    hasTouch: true,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results = await page.evaluate(async () => {
    const Plotly = PlotlyTest.default;
    const results = [];
    const check = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const xy = { x: [1, 2, 3], y: [2, 1, 3] };
    const xyz = { ...xy, z: [1, 3, 2] };
    const hierarchy = {
      labels: ["A", "B", "C"],
      parents: ["", "A", "A"],
      values: [3, 1, 2],
    };
    const field = {
      x: [0, 1, 0, 1, 0, 1, 0, 1],
      y: [0, 0, 1, 1, 0, 0, 1, 1],
      z: [0, 0, 0, 0, 1, 1, 1, 1],
    };
    const carpet = {
      type: "carpet",
      a: [0, 1, 2],
      b: [0, 1, 2],
      y: [
        [0, 1, 2],
        [1, 2, 3],
        [2, 3, 4],
      ],
    };
    const modernTypes = [
      "scattergl",
      "splom",
      "parcoords",
      "scatterpolargl",
      "scattersmith",
    ];
    const fixtures = {
      scatter: xy,
      scattergl: { ...xy, mode: "lines+markers" },
      splom: {
        dimensions: [
          { label: "Temperature", values: [18, 21, 24] },
          { label: "Humidity", values: [45, 52, 48] },
        ],
      },
      parcoords: {
        line: { color: [1, 2, 3] },
        dimensions: [
          { label: "Power", values: [1, 3, 2] },
          { label: "Voltage", values: [220, 230, 225] },
        ],
      },
      scatterpolargl: {
        mode: "lines+markers",
        r: [1, 2, 1.5],
        theta: [0, 120, 240],
      },
      scattersmith: {
        mode: "lines+markers",
        real: [0.5, 1, 2],
        imag: [-0.5, 0, 0.5],
      },
      bar: xy,
      box: xy,
      violin: xy,
      histogram: { x: [1, 1, 2, 3] },
      histogram2d: xy,
      histogram2dcontour: xy,
      heatmap: {
        z: [
          [1, 2],
          [3, 4],
        ],
      },
      contour: {
        z: [
          [1, 2],
          [3, 4],
        ],
      },
      scatterternary: { a: [0.2, 0.4], b: [0.3, 0.3], c: [0.5, 0.3] },
      funnel: { x: [3, 2, 1], y: ["A", "B", "C"] },
      waterfall: xy,
      pie: { labels: ["A", "B"], values: [1, 2] },
      sunburst: hierarchy,
      treemap: hierarchy,
      icicle: hierarchy,
      funnelarea: { labels: ["A", "B"], values: [3, 2] },
      scatter3d: xyz,
      surface: {
        z: [
          [1, 2],
          [3, 4],
        ],
      },
      isosurface: { ...field, value: [0, 1, 2, 3, 1, 2, 3, 4] },
      volume: { ...field, value: [0, 1, 2, 3, 1, 2, 3, 4] },
      mesh3d: { ...xyz, i: [0], j: [1], k: [2] },
      cone: { ...xyz, u: [1, 1, 1], v: [1, 1, 1], w: [1, 1, 1] },
      streamtube: {
        ...field,
        u: Array(8).fill(1),
        v: Array(8).fill(1),
        w: Array(8).fill(1),
        starts: { x: [0], y: [0], z: [0] },
      },
      parcats: {
        dimensions: [
          { label: "A", values: ["a", "b"] },
          { label: "B", values: ["c", "d"] },
        ],
      },
      sankey: {
        node: { label: ["A", "B"] },
        link: { source: [0], target: [1], value: [2] },
      },
      indicator: { value: 42, mode: "number" },
      table: {
        cells: {
          values: [
            [1, 2],
            [3, 4],
          ],
        },
      },
      carpet,
      scattercarpet: { a: [0, 1, 2], b: [0, 1, 2] },
      contourcarpet: {
        a: [0, 1, 2],
        b: [0, 1, 2],
        z: [
          [1, 2, 3],
          [2, 3, 4],
          [3, 4, 5],
        ],
      },
      ohlc: {
        x: [1, 2],
        open: [2, 3],
        high: [4, 5],
        low: [1, 2],
        close: [3, 4],
      },
      candlestick: {
        x: [1, 2],
        open: [2, 3],
        high: [4, 5],
        low: [1, 2],
        close: [3, 4],
      },
      scatterpolar: { r: [1, 2, 3], theta: [0, 120, 240] },
      barpolar: { r: [1, 2, 3], theta: [0, 120, 240] },
      scattergeo: { lon: [7, 8], lat: [46, 47] },
      choropleth: {
        locations: ["test"],
        z: [1],
        geojson: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "test",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [7, 46],
                    [8, 46],
                    [8, 47],
                    [7, 46],
                  ],
                ],
              },
            },
          ],
        },
      },
    };
    window.modernTraceCases = modernTypes.map((type) => ({
      type,
      data: fixtures[type],
    }));
    for (const [type, data] of Object.entries(fixtures)) {
      const div = document.createElement("div");
      document.body.append(div);
      const traces = ["scattercarpet", "contourcarpet"].includes(type)
        ? [carpet, { ...data, type }]
        : [{ ...data, type }];
      const layout = {
        width: 480,
        height: 285,
        geo: {
          showcoastlines: false,
          showland: false,
          showcountries: false,
          showlakes: false,
          showocean: false,
          showrivers: false,
          showframe: false,
          fitbounds: false,
          lataxis: { range: [45, 48] },
          lonaxis: { range: [6, 9] },
        },
      };
      try {
        if (modernTypes.includes(type)) {
          const validation =
            Plotly.validate(traces, {
              width: layout.width,
              height: layout.height,
            }) || [];
          check(!validation.length, `${type}: ${JSON.stringify(validation)}`);
        }
        await Plotly.newPlot(div, traces, layout, { showSendToCloud: false });
        check(
          div._fullData.at(-1).type === type,
          `${type}: silently fell back to another trace`,
        );
        check(
          div._fullData.at(-1).visible !== false,
          `${type}: invisible trace`,
        );
        check(div.querySelector("svg"), `${type}: no rendered SVG`);
        if (modernTypes.includes(type) && type !== "scattersmith") {
          check(div.querySelector("canvas"), `${type}: no rendered canvas`);
        }
        await Plotly.react(
          div,
          traces,
          { ...layout, width: 360 },
          { showSendToCloud: false },
        );
        check(div._fullLayout.width === 360, `${type}: resize/react failed`);
        results.push(type);
      } finally {
        Plotly.purge(div);
        div.remove();
      }
    }
    const div = document.createElement("div");
    document.body.append(div);
    const defaults = DefaultsTest.addPostParsingDefaults({
      entities: [],
      visible_range: [0, 4],
      raw_plotly_config: false,
      config: {},
      layout: {
        width: 480,
        height: 285,
        yaxis2: { overlaying: "y", side: "right" },
        shapes: [
          {
            type: "path",
            path: "M 0,0 L 0,2 Q 1,3 2,2 L 2,0 Z",
            fillcolor: "rgba(52,152,219,0.82)",
          },
        ],
        annotations: [{ x: 1, y: 1, text: "<b>900 L</b>", showarrow: false }],
      },
    });
    await Plotly.newPlot(
      div,
      [
        { ...xy, type: "scatter" },
        { ...xy, type: "bar", yaxis: "y2" },
      ],
      defaults.layout,
      defaults.config,
    );
    check(
      div._fullLayout.yaxis2.tickmode === "sync",
      "Overlaid axis did not use Plotly's synchronized-tick default",
    );
    check(
      div._context.showSendToCloud === false,
      "Cloud upload unexpectedly enabled",
    );
    check(
      !div.querySelector('[data-title*="Cloud"]'),
      "Cloud upload button visible",
    );
    check(div.querySelector(".shapelayer path"), "Tank shape missing");
    check(
      div.querySelector(".annotation-text").textContent === "900 L",
      "Tank label missing",
    );
    await Plotly.relayout(div, { "yaxis.autorange": true });
    check(div._fullLayout.yaxis.autorange, "Dotted relayout failed");
    const axisCases = [
      { name: "single axis", single: true, axis: {}, mode: "auto" },
      { name: "non-overlaid axis", axis: { overlaying: false }, mode: "auto" },
      {
        name: "raw overlaid axis",
        raw: true,
        axis: { overlaying: "y" },
        mode: "sync",
      },
      {
        name: "explicit independent ticks",
        axis: { overlaying: "y", tickmode: "auto" },
        mode: "auto",
      },
      {
        name: "inferred array ticks",
        axis: { overlaying: "y", tickvals: [1, 2, 3] },
        mode: "array",
      },
      {
        name: "inferred linear ticks",
        axis: { overlaying: "y", dtick: 1 },
        mode: "linear",
      },
      {
        name: "categorical overlaid axis",
        axis: { overlaying: "y", type: "category" },
        mode: "auto",
      },
    ];
    for (const test of axisCases) {
      const input = DefaultsTest.addPostParsingDefaults({
        entities: [],
        visible_range: [0, 4],
        raw_plotly_config: !!test.raw,
        config: {},
        layout: { width: 480, height: 285, yaxis2: test.axis },
      });
      const traces = [{ ...xy, type: "scatter" }];
      if (!test.single) traces.push({ ...xy, type: "scatter", yaxis: "y2" });
      await Plotly.react(div, traces, input.layout, input.config);
      const axis = div._fullLayout[test.single ? "yaxis" : "yaxis2"];
      check(
        axis.tickmode === test.mode,
        `${test.name}: expected ${test.mode}, got ${axis.tickmode}`,
      );
      results.push(test.name);
    }
    Plotly.purge(div);
    div.remove();
    results.push("axes, privacy, tank shapes, annotations, relayout");
    return { version: Plotly.version, results };
  });
  const source = await readFile("src/plotly.ts", "utf8");
  const expected = [
    ...source.matchAll(/^\s*require\("plotly\.js\/lib\/([^/".]+)"\)/gm),
  ]
    .map((match) => match[1])
    .filter((name) => name !== "calendars");
  for (const type of ["scatter", ...expected])
    assert(results.results.includes(type), `Missing browser fixture: ${type}`);
  assert.equal(results.version, "4.1.1");
  await page.evaluate(() => {
    customElements.define(
      "ha-card",
      class extends HTMLElement {
        connectedCallback() {
          this.style.display = "block";
        }
      },
    );
    const card = new CardTest.PlotlyGraph();
    card.id = "card-under-test";
    card.style.cssText =
      "display:block;width:480px;--card-background-color:white;--primary-background-color:white;--primary-color:blue;--primary-text-color:black;--secondary-text-color:gray";
    card.hass = {
      states: {},
      locale: { language: "en", first_weekday: "monday" },
      config: { time_zone: "Europe/Zurich" },
      themes: { darkMode: false },
    };
    card.setConfig({
      type: "custom:plotly-graph",
      refresh_interval: 0,
      hours_to_show: "24h",
      config: { displayModeBar: true },
      entities: [
        {
          entity: "",
          x: [Date.now() - 3600000, Date.now()],
          y: [10, 20],
          mode: "lines+markers",
          name: "Test power",
          unit_of_measurement: "W",
        },
      ],
    });
    document.body.append(card);
  });
  await page.waitForFunction(() => {
    const card = document.getElementById("card-under-test");
    return (
      card.contentEl?._fullData?.length === 1 &&
      card.contentEl.style.visibility === ""
    );
  });
  const cardState = await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    return {
      error: card.errorMsgEl.textContent,
      title: card.contentEl._fullLayout.yaxis.title.text,
      upload: card.contentEl._context.showSendToCloud,
      height: card.contentEl._fullLayout.height,
    };
  });
  assert.equal(cardState.error, "");
  assert.equal(cardState.title, "W");
  assert.equal(cardState.upload, false);
  assert.equal(cardState.height, 285);
  await page.evaluate(() => {
    document.getElementById("card-under-test").style.width = "320px";
  });
  await page.waitForFunction(() => {
    const card = document.getElementById("card-under-test");
    return card.contentEl._fullLayout.width <= 320;
  });
  // Native touch and detached-target completion need browser hit testing, not dispatchEvent.
  const cdp = await page.context().newCDPSession(page);
  const input = (type, touchPoints = []) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  const configure = async (overrides = {}) => {
    const point = await page.evaluate(async (overrides) => {
    const card = document.getElementById("card-under-test");
    window.touchBaseConfig ||= card.config;
    await card.setConfig({ ...touchBaseConfig, ...overrides });
    await card.plot({});
    PlotlyTest.default.Fx.unhover(card.contentEl);
    window.touchClicks = 0;
    window.touchDoubleClicks = 0;
    if (window.countTouchClick) card.contentEl.removeListener("plotly_click", window.countTouchClick);
    if (window.countTouchDoubleClick) card.contentEl.removeListener("plotly_doubleclick", window.countTouchDoubleClick);
    window.countTouchClick = () => window.touchClicks++;
    window.countTouchDoubleClick = () => window.touchDoubleClicks++;
    card.contentEl.on("plotly_click", window.countTouchClick);
    card.contentEl.on("plotly_doubleclick", window.countTouchDoubleClick);
    const r = card.contentEl.querySelector(".scatterlayer .point").getBoundingClientRect();
    return { id: 1, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, overrides);
    // Independent fixtures must not join the previous plot's native double-click train.
    await page.waitForTimeout(320);
    return point;
  };
  const tooltipPoint = () => page.evaluate(() => {
    const card = document.getElementById("card-under-test"), gd = card.contentEl;
    const label = gd.querySelector(".hovertext"), dragger = gd.querySelector(".nsewdrag.drag");
    const a = label.getBoundingClientRect(), b = dragger.getBoundingClientRect();
    const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
    const y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
    const target = card.shadowRoot.elementFromPoint(x, y);
    if (!target?.matches(".nsewdrag.drag")) throw new Error("Tooltip dismissal fixture does not hit main dragger");
    return { x, y };
  });
  const resetFixture = async (overrides) => {
    await configure(overrides);
    return page.evaluate(async () => {
      const card = document.getElementById("card-under-test"), gd = card.contentEl;
      const initial = [...gd._fullLayout.xaxis.range];
      const xs = gd.data[0].x.map(x => +new Date(x));
      const padding = (Math.max(...xs) - Math.min(...xs)) / 10;
      await PlotlyTest.default.relayout(gd, {
        "xaxis.range": [Math.min(...xs) - padding, Math.max(...xs) + padding],
      });
      await card.plot({});
      const r = gd.querySelector(".scatterlayer .point").getBoundingClientRect();
      return {
        point: { id: 1, x: r.x + r.width / 2, y: r.y + r.height / 2 },
        initial,
        narrowed: [...gd._fullLayout.xaxis.range],
      };
    });
  };
  // Existing cards retain native touch behavior and do not gain a toolbar item.
  const nativePoint = await configure({ layout: { dragmode: "pan" } });
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test"), gd = card.contentEl;
    return [card.touchController.touchDragMode, gd._fullLayout.dragmode,
      !!gd.querySelector('[data-attr="touchHover"]')];
  }), ["plotly", "pan", false]);
  await input("touchStart", [nativePoint]); await input("touchEnd");
  assert.deepEqual(await page.evaluate(() => {
    const gd = document.getElementById("card-under-test").contentEl;
    return [touchClicks, gd._hoverdata?.[0].pointNumber, !!gd.querySelector(".hovertext")];
  }), [1, 0, true]);
  await page.waitForTimeout(300);
  await input("touchStart", [{ id: 2, ...await tooltipPoint() }]); await input("touchEnd");
  await page.waitForTimeout(50);
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    return [touchClicks, !!card.contentEl.querySelector(".hovertext"), card.pausedRendering];
  }), [1, false, false], "Native touch tooltip was not dismissed cleanly");
  await page.waitForTimeout(300);
  const nativeRange = await page.evaluate(() =>
    [...document.getElementById("card-under-test").contentEl._fullLayout.xaxis.range]);
  await input("touchStart", [{ ...nativePoint, x: nativePoint.x - 80, y: nativePoint.y - 25 }]);
  await input("touchMove", [{ ...nativePoint, x: nativePoint.x - 30, y: nativePoint.y + 15 }]);
  await input("touchEnd"); await page.waitForTimeout(50);
  assert.notDeepEqual(await page.evaluate(() =>
    document.getElementById("card-under-test").contentEl._fullLayout.xaxis.range), nativeRange);
  assert.equal(await page.evaluate(() => touchClicks), 1, "Native drag clicked");

  // Plotly owns legend touch timing. The card's custom plot double-tap zoom
  // must not claim the second legend tap before Plotly can isolate the trace.
  await configure({
    touch_hover: false,
    layout: { dragmode: "pan", showlegend: true },
    entities: [
      { entity: "", x: [1, 2], y: [1, 2], mode: "lines+markers", name: "First" },
      { entity: "", x: [1, 2], y: [2, 1], mode: "lines+markers", name: "Second" },
    ],
  });
  const legendPoint = await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    const toggle = card.contentEl.querySelector(".legendtoggle");
    const r = toggle.getBoundingClientRect();
    const point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    if (!card.shadowRoot.elementFromPoint(point.x, point.y)?.matches(".legendtoggle"))
      throw new Error("Legend touch fixture does not hit the legend toggle");
    return { id: 20, ...point };
  });
  await input("touchStart", [legendPoint]); await input("touchEnd");
  await page.waitForTimeout(60);
  await input("touchStart", [{ ...legendPoint, id: 21 }]);
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    return [card.touchController.state, card.pausedRendering,
      card.touchController.lastSingleTouchTimestamp];
  }), ["idle", false, 0], "Second legend tap entered or armed custom plot zoom");
  await input("touchEnd");
  await page.waitForTimeout(400);
  assert.deepEqual(await page.evaluate(() => {
    const gd = document.getElementById("card-under-test").contentEl;
    return gd._fullData.map(trace => trace.visible);
  }), [true, "legendonly"], "Native legend double tap did not isolate the touched trace");

  // Opting in with an explicit dragmode starts native, survives normal card
  // rerenders, and remains independent from mouse behavior when Scan is selected.
  const mouse = await configure({ touch_hover: true,
    layout: { dragmode: "pan", showlegend: true } });
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test"), gd = card.contentEl;
    return [card.touchController.touchDragMode, gd._fullLayout.dragmode,
      !!gd.querySelector('[data-attr="touchHover"]'),
      gd.querySelector('[data-attr="touchHover"]')?.getAttribute("data-title")];
  }), ["plotly", "pan", true, "Scan"]);
  await page.locator('#card-under-test [data-attr="dragmode"][data-val="zoom"]').click();
  await page.evaluate(async () => { await document.getElementById("card-under-test").plot({}); });
  assert.equal(await page.evaluate(() =>
    document.getElementById("card-under-test").contentEl._fullLayout.dragmode), "zoom");
  for (const visible of ["legendonly", true]) {
    await page.evaluate(() => {
      const card = document.getElementById("card-under-test");
      window.legendReplot = new Promise(resolve => card.contentEl.once("plotly_restyle", () => {
        card.plot({}).then(resolve);
      }));
    });
    await page.locator("#card-under-test .legendtoggle").click();
    await page.evaluate(() => window.legendReplot);
    assert.equal(await page.evaluate(() =>
      document.getElementById("card-under-test").contentEl._fullData[0].visible), visible);
  }
  await page.locator('#card-under-test [data-attr="touchHover"]').click();
  await page.evaluate(async () => { await document.getElementById("card-under-test").plot({}); });
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test"), gd = card.contentEl;
    return [card.touchController.touchDragMode, gd._fullLayout.dragmode,
      gd.querySelectorAll('[data-attr="touchHover"]').length,
      gd.querySelector('[data-attr="touchHover"]').classList.contains("active")];
  }), ["hover", "zoom", 1, true]);
  const mouseRange = await page.evaluate(() =>
    [...document.getElementById("card-under-test").contentEl._fullLayout.xaxis.range]);
  await page.mouse.move(mouse.x - 80, mouse.y - 25); await page.mouse.down();
  await page.mouse.move(mouse.x - 30, mouse.y + 15, { steps: 3 }); await page.mouse.up();
  assert.notDeepEqual(await page.evaluate(() =>
    document.getElementById("card-under-test").contentEl._fullLayout.xaxis.range), mouseRange);

  const unifiedPoint = await configure({ touch_hover: false,
    layout: { dragmode: "pan", hovermode: "x unified" } });
  await input("touchStart", [unifiedPoint]); await input("touchEnd");
  await page.waitForTimeout(50);
  const unifiedTooltip = await page.evaluate(() => {
    const card = document.getElementById("card-under-test"), gd = card.contentEl;
    const label = gd.querySelector(".hoverlayer .legend"), dragger = gd.querySelector(".nsewdrag.drag");
    if (!label) throw new Error("Touch did not create unified tooltip");
    const a = label.getBoundingClientRect(), b = dragger.getBoundingClientRect();
    const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
    const y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
    if (!card.shadowRoot.elementFromPoint(x, y)?.matches(".nsewdrag.drag"))
      throw new Error("Unified tooltip dismissal fixture does not hit main dragger");
    return { id: 2, x, y };
  });
  await page.waitForTimeout(300);
  await input("touchStart", [unifiedTooltip]); await input("touchEnd");
  await page.waitForTimeout(50);
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test"), gd = card.contentEl;
    const label = gd.querySelector(".hoverlayer .legend"), rect = label?.getBoundingClientRect();
    return [touchClicks, !!rect?.width && !!rect?.height,
      card.touchController.state, gd._fullLayout.dragmode];
  }), [1, false, "idle", "pan"], "Unified touch tooltip was not dismissed cleanly");

  const mousePoint = await configure({ touch_hover: false, layout: { dragmode: "pan" } });
  await page.mouse.move(mousePoint.x, mousePoint.y);
  await page.waitForFunction(() =>
    !!document.getElementById("card-under-test").contentEl.querySelector(".hovertext"));
  const mouseTooltip = { id: 2, ...await tooltipPoint() };
  await input("touchStart", [mouseTooltip]);
  assert.notEqual(await page.evaluate(() =>
    document.getElementById("card-under-test").touchController.state),
  "tooltip dismiss", "Mouse tooltip was claimed by touch dismissal");
  await input("touchEnd");

  const hoverPoint = await configure({ touch_hover: true });
  assert.equal(await page.evaluate(() => document.getElementById("card-under-test").touchController.touchDragMode), "hover");
  await input("touchStart", [hoverPoint]); await input("touchEnd");
  await page.waitForTimeout(60);
  assert.deepEqual(await page.evaluate(() => [touchClicks,
    !!document.getElementById("card-under-test").contentEl.querySelector(".hovertext")]), [1, true]);
  await page.waitForTimeout(300);
  await input("touchStart", [{ id: 2, ...await tooltipPoint() }]); await input("touchEnd");
  await page.waitForTimeout(50);
  assert.deepEqual(await page.evaluate(() => [touchClicks,
    !!document.getElementById("card-under-test").contentEl.querySelector(".hovertext")]), [1, false]);

  // A clean second tap is replayed to Plotly so its own double-click reset
  // semantics run; movement keeps using the card's one-finger zoom instead.
  for (const [overrides, expectedMode] of [
    [{ touch_hover: false, layout: { dragmode: "pan" } }, "plotly"],
    [{ touch_hover: true }, "hover"],
  ]) {
    const fixture = await resetFixture(overrides);
    assert.notDeepEqual(fixture.narrowed, fixture.initial);
    await input("touchStart", [fixture.point]); await input("touchEnd");
    await page.waitForTimeout(60);
    assert.deepEqual(await page.evaluate(() => {
      const gd = document.getElementById("card-under-test").contentEl;
      return [touchClicks, touchDoubleClicks, !!gd.querySelector(".hovertext")];
    }), [1, 0, true], `${expectedMode} first tap did not establish Plotly's click train`);
    await input("touchStart", [{ ...fixture.point, id: 2 }]); await input("touchEnd");
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => {
      const card = document.getElementById("card-under-test"), gd = card.contentEl;
      return [touchClicks, touchDoubleClicks, !!gd.querySelector(".hovertext"),
        card.touchController.touchDragMode, card.pausedRendering,
        gd._fullLayout.xaxis.range];
    }), [1, 1, false, expectedMode, false, fixture.initial],
    `Clean ${expectedMode} double tap did not reset through Plotly`);
  }

  const cancelReset = await resetFixture({ touch_hover: true });
  await input("touchStart", [cancelReset.point]); await page.waitForTimeout(60);
  await input("touchEnd"); await page.waitForTimeout(60);
  await input("touchStart", [{ ...cancelReset.point, id: 2 }]);
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    return [card.touchController.state, card.pausedRendering];
  }), ["one finger", true]);
  await input("touchCancel"); await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test"), gd = card.contentEl;
    return [touchClicks, touchDoubleClicks, card.touchController.state,
      card.pausedRendering, gd._fullLayout.xaxis.range];
  }), [1, 0, "idle", false, cancelReset.narrowed], "Cancelled double tap reset or leaked zoom lifecycle");

  // Native and Touch Hover use the same existing one-finger zoom once a clean
  // first tap has armed the double-tap window.
  for (const [overrides, expectedMode, sticky] of [
    [{ touch_hover: false, layout: { dragmode: "pan" } }, "plotly", false],
    [{ touch_hover: true }, "hover", true],
  ]) {
    const first = await configure(overrides);
    await input("touchStart", [first]); await input("touchEnd");
    await page.waitForTimeout(60);
    const before = await page.evaluate(() =>
      [...document.getElementById("card-under-test").contentEl._fullLayout.xaxis.range]);
    const second = { ...first, id: 2 };
    await input("touchStart", [second]);
    await input("touchMove", [{ ...second, y: second.y + 60 }]);
    // Crossing the threshold is sticky: returning to the start cannot turn the
    // custom zoom back into Plotly's clean-double-tap reset.
    if (sticky) await input("touchMove", [second]);
    await input("touchEnd"); await page.waitForTimeout(80);
    assert.deepEqual(await page.evaluate(() => {
      const card = document.getElementById("card-under-test");
      return [touchClicks, touchDoubleClicks, card.touchController.touchDragMode,
        card.pausedRendering, !!card.contentEl.querySelector(".hovertext")];
    }), [1, 0, expectedMode, false, false],
    `${expectedMode} double-tap-drag leaked a click, reset, or tooltip`);
    if (!sticky) assert.notDeepEqual(await page.evaluate(() =>
      document.getElementById("card-under-test").contentEl._fullLayout.xaxis.range), before);
  }

  // A scrub does not arm the next gesture as a double-tap zoom.
  const scrub = await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    const r = card.contentEl.querySelector(".scatterlayer .point").getBoundingClientRect();
    return { id: 3, x: r.x + r.width / 2 - 20, y: r.y + r.height / 2 };
  });
  await input("touchStart", [scrub]);
  await input("touchMove", [{ ...scrub, x: scrub.x + 20 }]); await input("touchEnd");
  await page.evaluate(() => PlotlyTest.default.Fx.unhover(
    document.getElementById("card-under-test").contentEl));
  const immediate = { ...scrub, id: 4, x: scrub.x - 20 };
  await input("touchStart", [immediate]);
  await input("touchMove", [{ ...immediate, x: immediate.x + 20 }]); await input("touchEnd");
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    return [card.touchController.touchDragMode, touchClicks,
      touchDoubleClicks, card.pausedRendering];
  }), ["hover", 1, 0, false], "A scrub armed double-tap zoom");

  const unifiedDouble = await resetFixture({ touch_hover: false,
    layout: { dragmode: "pan", hovermode: "x unified" } });
  await input("touchStart", [unifiedDouble.point]); await input("touchEnd");
  const unifiedSecond = await page.evaluate(() => {
    const card = document.getElementById("card-under-test"), gd = card.contentEl;
    const label = gd.querySelector(".hoverlayer .legend"), dragger = gd.querySelector(".nsewdrag.drag");
    if (!label) throw new Error("Double-tap fixture did not create unified tooltip");
    const a = label.getBoundingClientRect(), b = dragger.getBoundingClientRect();
    const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
    const y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
    if (!card.shadowRoot.elementFromPoint(x, y)?.matches(".nsewdrag.drag"))
      throw new Error("Unified double-tap fixture does not hit main dragger");
    return { id: 2, x, y };
  });
  await input("touchStart", [unifiedSecond]);
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test"), gd = card.contentEl;
    const label = gd.querySelector(".hoverlayer .legend"), rect = label?.getBoundingClientRect();
    return [card.touchController.state, !!rect?.width && !!rect?.height, touchClicks];
  }), ["one finger", false, 1], "Unified tooltip preempted double-tap zoom");
  await input("touchEnd"); await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test"), gd = card.contentEl;
    const label = gd.querySelector(".hoverlayer .legend"), rect = label?.getBoundingClientRect();
    return [card.touchController.state, touchClicks, touchDoubleClicks,
      !!rect?.width && !!rect?.height, gd._fullLayout.xaxis.range];
  }), ["idle", 1, 1, false, unifiedDouble.initial],
  "Unified clean double tap did not reset through Plotly");

  const disabledDouble = await configure({ touch_hover: true, disable_pinch_to_zoom: true });
  await input("touchStart", [disabledDouble]); await input("touchEnd");
  await page.waitForTimeout(50);
  assert.deepEqual(await page.evaluate(() => {
    const gd = document.getElementById("card-under-test").contentEl;
    return [touchClicks, !!gd.querySelector(".hovertext")];
  }), [1, true]);
  const outsideTooltip = await page.evaluate(() => {
    const card = document.getElementById("card-under-test"), gd = card.contentEl;
    const r = gd.querySelector(".nsewdrag.drag").getBoundingClientRect();
    const labels = [...gd.querySelectorAll(".hoverlayer .hovertext, .hoverlayer .axistext, .hoverlayer .legend")]
      .map(label => label.getBoundingClientRect()).filter(rect => rect.width && rect.height);
    for (const [fx, fy] of [[.2, .2], [.8, .2], [.2, .8], [.8, .8]]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (card.shadowRoot.elementFromPoint(x, y)?.matches(".nsewdrag.drag")
        && !labels.some(a => x >= a.left && x <= a.right && y >= a.top && y <= a.bottom))
        return { id: 2, x, y };
    }
    throw new Error("Could not find main-dragger point outside tooltip");
  });
  await input("touchStart", [outsideTooltip]);
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    return [card.touchController.state, card.touchController.touchDragMode,
      card.touchController.isEnabled];
  }), ["hover", "hover", false], "Disabled custom zoom entered one-finger zoom");
  await input("touchMove", [{ ...outsideTooltip, x: outsideTooltip.x + 20 }]); await input("touchEnd");
  const firstPinch = { ...outsideTooltip, id: 3 }, secondPinch = {
    ...outsideTooltip, id: 4, x: outsideTooltip.x + 30,
  };
  await input("touchStart", [firstPinch]);
  await input("touchStart", [firstPinch, secondPinch]);
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    return [card.touchController.state, card.pausedRendering];
  }), ["hover consumed", false], "Disabled pinch entered custom zoom");
  await input("touchEnd", [firstPinch]); await input("touchEnd");

  const toolReset = await configure({ touch_hover: true });
  await input("touchStart", [toolReset]); await input("touchEnd");
  await page.locator('#card-under-test [data-attr="dragmode"][data-val="pan"]').click();
  const afterToolChange = { ...toolReset, id: 2, x: toolReset.x - 50 };
  await input("touchStart", [afterToolChange]);
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    return [card.touchController.state, card.touchController.touchDragMode];
  }), ["idle", "plotly"], "Tool change retained pending double-tap timing");
  await input("touchEnd");

  await configure({ touch_hover: true, layout: { dragmode: "zoom" } });
  await page.evaluate(async () => {
    const card = document.getElementById("card-under-test"), gd = card.contentEl;
    const c = card.touchController, Plotly = PlotlyTest.default;
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const tick = () => new Promise(resolve => requestAnimationFrame(resolve));
    const center = el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    const main = () => gd.querySelector(".nsewdrag.drag");
    const point = () => center(gd.querySelector(".scatterlayer .point"));
    const touch = (target, p = point(), identifier = 1) =>
      new Touch({ identifier, target, clientX: p.x, clientY: p.y });
    const fire = (target, type, touches, changedTouches = touches) => {
      const e = new TouchEvent(type, { bubbles: true, composed: true, cancelable: true, touches,
        targetTouches: touches.filter(t => t.target === target), changedTouches });
      target.dispatchEvent(e);
      return e;
    };
    const tap = (target, p = point(), jitter = 0) => {
      const a = touch(target, p), b = touch(target, { x: p.x + jitter, y: p.y });
      fire(target, "touchstart", [a]);
      if (jitter) fire(target, "touchmove", [b]);
      fire(target, "touchend", [], [b]);
    };
    const button = () => gd.querySelector('[data-attr="touchHover"]');
    const native = mode => gd.querySelector('[data-attr="dragmode"][data-val="' + mode + '"]');
    const clear = () => Plotly.Fx.unhover(gd);
    check(c.touchDragMode === "plotly" && gd._fullLayout.dragmode === "zoom", "Explicit dragmode did not select native touch");
    button().click(); await Promise.resolve();
    check(c.touchDragMode === "hover" && gd._fullLayout.dragmode === "zoom", "Touch/mouse modes are not independent");

    // Config structure: preserve Plotly's explicit/default and flat/grouped distinctions.
    const added = { name: "existing", icon: Plotly.Icons.home, click() {} };
    for (const config of [{}, { modeBarButtons: [] }, { modeBarButtonsToAdd: [added] },
      { modeBarButtonsToAdd: [[added]] }, { modeBarButtons: [["pan2d"]], modeBarButtonsToAdd: [added] }]) {
      const before = JSON.stringify(config), wrapped = c.withTouchHoverModeBar(config);
      check(JSON.stringify(config) === before, "Wrapper mutated user config");
      if (config.modeBarButtons?.length) {
        check(wrapped.modeBarButtons.length === 2 && wrapped.modeBarButtonsToAdd === config.modeBarButtonsToAdd, "Explicit groups changed");
      } else {
        const additions = wrapped.modeBarButtonsToAdd;
        check(Array.isArray(additions.at(-1)) === Array.isArray(config.modeBarButtonsToAdd?.[0]), "Addition structure changed");
      }
    }
    const selected = active => {
      check(button().classList.contains("active") === active, "Wrong selected class");
    };
    const nativeSelected = mode => {
      for (const nativeButton of gd.querySelectorAll('.modebar-btn[data-attr="dragmode"]')) {
        const active = nativeButton.dataset.val === mode;
        check(nativeButton.classList.contains("active") === active, "Wrong native selected class");
      }
    };
    selected(true); nativeSelected();
    button().click(); await Promise.resolve(); selected(true); nativeSelected();
    gd.querySelector('[data-attr="zoom"][data-val="in"]').click();
    await tick(); selected(true); nativeSelected();
    native("pan").click(); await tick(); selected(false); nativeSelected("pan");
    button().click(); await Promise.resolve(); selected(true); nativeSelected();
    native("pan").click(); await Promise.resolve(); selected(false); nativeSelected("pan");
    button().click(); await Promise.resolve(); selected(true); nativeSelected();
    native("zoom").click(); await tick(); selected(false); nativeSelected("zoom");
    await card.plot({});
    check(c.touchDragMode === "plotly", "Replot reset runtime selection");
    check(gd.querySelectorAll('[data-attr="touchHover"]').length === 1, "Replot accumulated buttons");
    selected(false); nativeSelected("zoom");
    button().click(); await Promise.resolve(); selected(true); nativeSelected();

    // Keep low-level gesture assertions stable; lifecycle cases below restore live relayout.
    card.handles.relayoutListener?.off("plotly_relayout", card.onRelayout);
    try {
      const xs = gd.data[0].x.map(x => +new Date(x));
      await Plotly.relayout(gd, { "xaxis.range": [Math.min(...xs) - 3600000, Math.max(...xs) + 3600000], "yaxis.autorange": true, hovermode: "x" });
      clear(); const tapClicks = touchClicks;
      const tapTarget = main(), tapPoint = point(), stationary = touch(tapTarget, tapPoint);
      fire(tapTarget, "touchstart", [stationary]);
      // Plotly throttles hover by 50 ms; a real tap lasts long enough for the
      // hover data used by Plotly's click path to settle before touchend.
      await new Promise(resolve => setTimeout(resolve, 60));
      fire(tapTarget, "touchend", [], [stationary]); await tick();
      check(touchClicks === tapClicks + 1 && !card.pausedRendering,
        "Stationary Scan tap lost click or invoked zoom");
      await new Promise(resolve => setTimeout(resolve, gd._context.doubleClickDelay + 20));
      clear();
      const target = main(), p = point(), a = touch(target, { x: p.x - 20, y: p.y }), b = touch(target, p);
      const before = touchClicks, range = JSON.stringify(gd._fullLayout.xaxis.range);
      fire(target, "touchstart", [a]); fire(target, "touchmove", [b]); fire(target, "touchend", [], [b]);
      await new Promise(resolve => setTimeout(resolve, 80));
      check(touchClicks === before && JSON.stringify(gd._fullLayout.xaxis.range) === range, "Scrub clicked or changed range");
      check(!gd._dragging && gd.querySelector(".hovertext"), "Scrub did not use hover exclusively");
      await new Promise(resolve => setTimeout(resolve, 80));
      // Coordinates lie inside label geometry, while browser hit testing chooses the underlying surface.
      const label = gd.querySelector(".hovertext"), lp = center(label);
      check(card.shadowRoot.elementFromPoint(lp.x, lp.y) === target, "Tooltip fixture does not hit main dragger");
      const dismiss = touch(target, lp, 10);
      fire(target, "touchstart", [dismiss]);
      check(c.state === "tooltip dismiss" && gd.querySelector(".hovertext"), "Tooltip dismissed before tap completed");
      fire(target, "touchend", [], [dismiss]);
      check(!gd.querySelector(".hovertext") && touchClicks === before, "Dismissal clicked or did not clear");

      const showTouchTooltip = async () => {
        clear();
        const q = point(), start = touch(target, { x: q.x - 20, y: q.y }, 20);
        const moved = touch(target, q, 20);
        fire(target, "touchstart", [start]); fire(target, "touchmove", [moved]); fire(target, "touchend", [], [moved]);
        await new Promise(resolve => setTimeout(resolve, 80));
        const current = gd.querySelector(".hovertext");
        check(current, "Touch Hover did not create dismissible tooltip");
        return center(current);
      };

      await showTouchTooltip();
      const axisLabel = gd.querySelector(".axistext"), ap = center(axisLabel);
      const axis = card.shadowRoot.elementFromPoint(ap.x, ap.y);
      check(axis.matches(".ewdrag.drag"), "Tooltip overlap fixture does not hit axis");
      const axisTouch = touch(axis, ap);
      let axisDelivered = false;
      axis.addEventListener("touchstart", () => { axisDelivered = true; }, { once: true });
      fire(axis, "touchstart", [axisTouch]);
      check(c.state === "idle" && axisDelivered, "Axis overlap acquired tooltip dismissal");
      fire(axis, "touchend", [], [axisTouch]);

      const clicks = touchClicks;
      for (const ending of ["drag", "multitouch", "cancel"]) {
        const at = gd.querySelector(".hovertext")
          ? center(gd.querySelector(".hovertext")) : await showTouchTooltip();
        const first = touch(target, at, 30), moved = touch(target, { x: at.x + 12, y: at.y }, 30);
        fire(target, "touchstart", [first]);
        if (ending === "drag") {
          fire(target, "touchmove", [moved]); fire(target, "touchend", [], [moved]);
        } else if (ending === "multitouch") {
          const second = touch(target, { x: at.x + 20, y: at.y }, 31);
          fire(target, "touchstart", [first, second], [second]);
          fire(target, "touchend", [first], [second]); fire(target, "touchend", [], [first]);
        } else fire(target, "touchcancel", [], [first]);
        check(c.state === "idle" && gd.querySelector(".hovertext") && touchClicks === clicks,
          "Invalid tooltip-dismiss gesture cleared, clicked, or leaked state: " + ending);
      }
      const retry = touch(target, center(gd.querySelector(".hovertext")), 32);
      fire(target, "touchstart", [retry]); fire(target, "touchend", [], [retry]);
      check(!gd.querySelector(".hovertext") && touchClicks === clicks,
        "Clean retry did not dismiss tooltip after invalid gestures");
      clear();
      // Selecting a native tool during ownership only affects the next gesture.
      fire(target, "touchstart", [a]); native("pan").click(); await Promise.resolve();
      fire(target, "touchmove", [b]); fire(target, "touchend", [], [b]);
      check(!gd._dragging && c.touchDragMode === "plotly", "Tool selection handed off an owned gesture");
    } finally {
      card.handles.relayoutListener.on("plotly_relayout", card.onRelayout);
    }

    // Live custom pinch lifecycle: partial release holds the pause, while both
    // Scan-origin and native-origin cancellation balance it exactly once.
    const start = c.onZoomStart, end = c.onZoomEnd;
    let starts = 0, ends = 0;
    c.onZoomStart = () => { starts++; start(); };
    c.onZoomEnd = () => { ends++; end(); };
    try {
      c.isEnabled = true; c.setTouchDragMode("hover"); clear();
      let target = main(), p = center(target);
      let a = touch(target, p), b = touch(target, { x: p.x + 30, y: p.y }, 2);
      const clicks = touchClicks, count = starts;
      fire(target, "touchstart", [a]); fire(target, "touchstart", [a, b], [b]);
      const moved = touch(target, { x: p.x + 65, y: p.y }, 2);
      const range = JSON.stringify(gd._fullLayout.xaxis.range);
      fire(target, "touchmove", [a, moved], [moved]); await tick();
      check(card.pausedRendering && JSON.stringify(gd._fullLayout.xaxis.range) !== range,
        "Scan-origin pinch did not start or move");
      fire(target, "touchend", [a], [moved]);
      check(card.pausedRendering && ends === count, "Partial release ended pinch pause");
      await card.plot({});
      check(main() === target, "Paused replot replaced pinch target");
      fire(target, "touchend", [], [a]);
      check(!card.pausedRendering && starts === ends && c.state === "idle"
        && touchClicks === clicks, "Pinch completion did not balance");
      await card.plot({});

      target = main(); p = center(target);
      a = touch(target, p, 3); b = touch(target, { x: p.x + 30, y: p.y }, 4);
      fire(target, "touchstart", [a]); fire(target, "touchstart", [a, b], [b]);
      fire(target, "touchcancel", [], [a, b]);
      check(!card.pausedRendering && starts === ends && c.state === "idle",
        "Cancelled Scan-origin pinch leaked its zoom lifecycle");
      await card.plot({});

      c.setTouchDragMode("plotly"); target = main(); p = center(target);
      a = touch(target, p, 5); b = touch(target, { x: p.x + 30, y: p.y }, 6);
      fire(target, "touchstart", [a]); fire(target, "touchstart", [a, b], [b]);
      check(card.pausedRendering, "Native-origin custom pinch did not start");
      fire(target, "touchcancel", [], [a, b]);
      check(!card.pausedRendering && starts === ends && c.state === "idle",
        "Cancelled native-origin pinch leaked its zoom lifecycle");
    } finally { c.onZoomStart = start; c.onZoomEnd = end; c.isEnabled = true; }

    // Representative end-to-end provenance: the fallback Pan selects Scan,
    // while a preset's explicit native dragmode does not.
    window.PlotlyGraphCardPresets = { touchNative: { layout: { dragmode: "zoom" } } };
    try {
      await card.setConfig({ ...touchBaseConfig, touch_hover: true });
      await card.plot({});
      check(c.touchDragMode === "hover" && button()?.classList.contains("active"),
        "Fallback Pan did not initially select Scan");
      await card.setConfig({ ...touchBaseConfig, touch_hover: true, preset: "touchNative" });
      await card.plot({});
      check(c.touchDragMode === "plotly" && gd._fullLayout.dragmode === "zoom"
        && !button()?.classList.contains("active"),
        "Preset dragmode did not initially select native touch");
    } finally { delete window.PlotlyGraphCardPresets; }

    // One dynamic expression proves availability can change without resetting
    // an existing runtime selection.
    card.hass.states.enabled = { state: "on" };
    await card.setConfig({ ...touchBaseConfig, touch_hover: '$ex hass.states.enabled.state === "on"' });
    native("pan").click(); await Promise.resolve();
    for (const value of ["off", "on"]) {
      card.hass.states.enabled = { state: value }; await card.plot({});
      check(!!button() === (value === "on") && c.touchDragMode === "plotly",
        "Dynamic availability reset runtime selection");
    }

    // A superseded async parse cannot consume the newer configuration's
    // one-time touch-mode initialization.
    const update = card.configParser.update.bind(card.configParser);
    let release, entered, first = true;
    const gate = new Promise(resolve => release = resolve);
    const waiting = new Promise(resolve => entered = resolve);
    card.configParser.update = async args => {
      const result = await update(args);
      if (first) { first = false; entered(); await gate; }
      return result;
    };
    try {
      await card.setConfig({ ...touchBaseConfig, touch_hover: false });
      const old = card.plot({}); await waiting;
      await card.setConfig({ ...touchBaseConfig, touch_hover: true });
      release(); await old; await card.plot({});
      check(c.touchHoverEnabled && c.touchDragMode === "hover"
        && button()?.classList.contains("active"),
        "Old parse consumed the newer touch-mode initialization");
    } finally { card.configParser.update = update; }
    // A plot without a Cartesian main dragger cannot acquire Hover.
    const other = document.createElement("div"); document.body.append(other);
    await Plotly.newPlot(other, [{ type: "scatterternary", a: [1], b: [1], c: [1] }]);
    const otherController = new c.constructor({ el: other, onZoomStart() { throw new Error("Non-Cartesian zoom acquired"); }, onZoomEnd() {} });
    otherController.touchHoverEnabled = true; otherController.setTouchDragMode("hover"); otherController.connect();
    try {
      check(!otherController.getMainDragger(), "Non-Cartesian fixture has Cartesian dragger");
      const t = touch(other, { x: 10, y: 10 });
      check(!fire(other, "touchstart", [t]).defaultPrevented, "Non-Cartesian event intercepted");
      await Plotly.react(other, other.data, other.layout, otherController.withTouchHoverModeBar({ displayModeBar: true }));
      otherController.syncModeBarState();
      check(other.querySelector('[data-attr="touchHover"]').style.display === "none", "Non-Cartesian Hover tool exposed");
    } finally { otherController.disconnect(); Plotly.purge(other); other.remove(); }
  });

  // A real held touch completes on its detached original target, without clicking new data.
  const p = await configure({ touch_hover: true });
  await input("touchStart", [p]);
  await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    window.oldTouchTarget = card.contentEl.querySelector(".nsewdrag");
    // A genuine Plotly config change rebuilds the plot; ordinary renders should not.
    await card.setConfig({ ...card.config, config: { ...card.config.config, displaylogo: true } });
    await card.plot({});
    if (oldTouchTarget.isConnected) throw new Error("Expected dragger replacement");
  });
  // B's start is consumed on the replacement. A ending must not release B or
  // let it become the middle of a native gesture on the replacement plot.
  const b = { ...p, id: 2, x: p.x + 15 };
  await input("touchStart", [p, b]); await input("touchEnd", [b]);
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    return [card.touchController.state, !!card.contentEl._dragging,
      card.pausedRendering, touchClicks];
  }), ["hover consumed", false, false, 0]);
  await input("touchCancel");
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    return [card.touchController.state, card.pausedRendering, touchClicks];
  }), ["idle", false, 0], "Detached ownership did not clean up");
  // An axis contact stays native even while another finger belongs to Hover.
  const held = await configure({ touch_hover: true });
  await input("touchStart", [held]);
  const axis = await page.evaluate(() => {
    const card = document.getElementById("card-under-test"), target = card.contentEl.querySelector(".ewdrag.drag");
    window.axisStarts = 0;
    target.addEventListener("touchstart", () => axisStarts++, { once: true });
    const r = target.getBoundingClientRect();
    return { id: 2, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await input("touchStart", [held, axis]);
  assert.deepEqual(await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    return [axisStarts, card.touchController.state, card.pausedRendering];
  }), [1, "hover consumed", false], "Axis start was stolen or entered the controller's native pinch path");
  await input("touchEnd", [held]); await input("touchEnd");
  assert.equal(await page.evaluate(() => touchClicks), 0, "Axis multi-touch retained Hover tap eligibility");
  results.results.push("native touch preservation and opt-in touch hover");

  results.results.push("Lovelace card with mock HA state");
  const modernCardResults = await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    const rendered = [];
    for (const { type, data } of window.modernTraceCases) {
      await card.setConfig({
        type: "custom:plotly-graph",
        raw_plotly_config: true,
        refresh_interval: 0,
        layout: {},
        entities: [{ entity: "", ...data, type }],
      });
      try {
        await card.plot({ should_fetch: true });
      } catch (error) {
        throw new Error(`${type}: ${error.message}`);
      }
      if (card.errorMsgEl.textContent)
        throw new Error(card.errorMsgEl.textContent);
      if (
        card.contentEl._fullData[0].type !== type ||
        card.contentEl._fullData[0].visible === false
      ) {
        throw new Error(`${type}: card did not render the requested trace`);
      }
      rendered.push(`Lovelace card: ${type}`);
    }
    return rendered;
  });
  results.results.push(...modernCardResults);
  await configure({ touch_hover: true });
  // Disconnecting an owned pinch must clear the render pause without scheduling a disconnected replot.
  await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    const c = card.touchController;
    c.isEnabled = true;
    c.touchHoverEnabled = true;
    c.setTouchDragMode("hover");
    const target = card.contentEl.querySelector(".nsewdrag.drag");
    const r = target.getBoundingClientRect();
    const p = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const a = new Touch({ identifier: 1, target, clientX: p.x, clientY: p.y });
    const b = new Touch({ identifier: 2, target, clientX: p.x + 30, clientY: p.y });
    const fire = (type, touches, changedTouches = touches) =>
      target.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, composed: true, touches,
        targetTouches: touches, changedTouches,
      }));
    fire("touchstart", [a]);
    fire("touchstart", [a, b], [b]);
    if (!card.pausedRendering || c.state !== "hover pinch")
      throw new Error("Disconnect fixture did not enter owned pinch");
    card.remove();
    if (card.pausedRendering || c.state !== "idle")
      throw new Error("Disconnect left owned pinch paused");
  });
  await page.waitForTimeout(20);

  // A mouse/keyboard-only client should retain Plotly's native toolbar even
  // when the shared card configuration enables the touch-only tool.
  const desktopPage = await browser.newPage({
    viewport: { width: 1000, height: 800 },
  });
  desktopPage.on("pageerror", (error) => errors.push(error.message));
  await desktopPage.goto(`http://127.0.0.1:${server.address().port}`);
  await desktopPage.evaluate(() => {
    customElements.define("ha-card", class extends HTMLElement {});
    const card = new CardTest.PlotlyGraph();
    card.id = "desktop-card";
    card.style.cssText =
      "display:block;width:480px;--card-background-color:white;--primary-background-color:white;--primary-color:blue;--primary-text-color:black;--secondary-text-color:gray";
    card.hass = {
      states: {},
      locale: { language: "en", first_weekday: "monday" },
      config: { time_zone: "Europe/Zurich" },
      themes: { darkMode: false },
    };
    card.setConfig({
      type: "custom:plotly-graph",
      refresh_interval: 0,
      touch_hover: true,
      config: { displayModeBar: true },
      entities: [{ entity: "", x: [1, 2], y: [1, 2] }],
    });
    document.body.append(card);
  });
  await desktopPage.waitForFunction(() =>
    document.getElementById("desktop-card")?.contentEl?._fullData?.length === 1);
  assert.deepEqual(await desktopPage.evaluate(() => {
    const gd = document.getElementById("desktop-card").contentEl;
    return [navigator.maxTouchPoints,
      !!gd.querySelector('[data-attr="touchHover"]'),
      gd.querySelector('.modebar-btn[data-attr="dragmode"].active')?.dataset.val];
  }), [0, false, "pan"], "Mouse-only client exposed Touch Hover or changed the native tool UI");
  await desktopPage.locator('#desktop-card [data-attr="dragmode"][data-val="zoom"]').click();
  await desktopPage.waitForTimeout(50);
  assert.deepEqual(await desktopPage.evaluate(() => {
    const gd = document.getElementById("desktop-card").contentEl;
    return [gd._fullLayout.dragmode,
      gd.querySelector('.modebar-btn[data-attr="dragmode"].active')?.dataset.val,
      !!gd.querySelector('[data-attr="touchHover"]')];
  }), ["zoom", "zoom", false], "Mouse-only native tool selection was not preserved");
  await desktopPage.close();
  results.results.push("mouse-only toolbar omits Touch Hover");

  assert.deepEqual(errors, []);
  console.log(
    `Plotly ${results.version}: ${results.results.length} browser checks passed`,
  );
  console.log(results.results.join(", "));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

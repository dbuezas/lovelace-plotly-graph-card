import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle = await build({
  stdin: {
    contents: `export { default as Plotly } from './src/plotly';
      export { PlotlyGraph } from './src/plotly-graph-card';`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "ResizeTest",
  outdir: "dist",
});
const js = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text;
const server = createServer((request, response) => {
  response.setHeader(
    "Content-Type",
    request.url === "/test.js" ? "text/javascript" : "text/html",
  );
  response.end(
    request.url === "/test.js"
      ? js
      : '<!doctype html><script src="/test.js"></script>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results = await page.evaluate(async () => {
    const { Plotly, PlotlyGraph } = ResizeTest;
    const results = [];
    const check = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const wait = async (condition) => {
      const deadline = performance.now() + 5000;
      while (!condition()) {
        if (performance.now() > deadline)
          throw new Error(
            `Timed out after ${results.at(-1)}: ${JSON.stringify({
              measured: card.size,
              rendered: card.renderedSize,
              width: card.contentEl._fullLayout?.width,
              height: card.contentEl._fullLayout?.height,
              error: card.errorMsgEl.textContent,
            })}`,
          );
        await new Promise(requestAnimationFrame);
      }
    };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
    customElements.define(
      "ha-card",
      class extends HTMLElement {
        connectedCallback() {
          this.style.display = "block";
        }
      },
    );
    const counts = { parse: 0, react: 0, relayout: 0, fetch: 0 };
    for (const method of ["react", "relayout"]) {
      const original = Plotly[method];
      Plotly[method] = (...args) => {
        counts[method]++;
        return original(...args);
      };
    }
    const config = (layout = {}) => ({
      type: "custom:plotly-graph",
      refresh_interval: 0,
      hours_to_show: "24h",
      layout,
      entities: [
        { entity: "", x: [Date.now() - 3600000, Date.now()], y: [1, 2] },
      ],
    });
    const create = (layout, panelHeight) => {
      const card = new PlotlyGraph();
      card.style.cssText = `display:block;width:480px;${panelHeight ? `height:${panelHeight}px;` : ""}
        --card-background-color:white;--primary-background-color:white;
        --primary-color:blue;--primary-text-color:black;--secondary-text-color:gray`;
      card.hass = {
        states: {},
        locale: { language: "en", first_weekday: "monday" },
        config: { time_zone: "Europe/Zurich" },
        themes: { darkMode: false },
        callWS: async () => {
          counts.fetch++;
          throw new Error("Unexpected history fetch");
        },
        callApi: async () => {
          counts.fetch++;
          throw new Error("Unexpected history fetch");
        },
      };
      const update = card.configParser.update.bind(card.configParser);
      card.configParser.update = (...args) => {
        counts.parse++;
        return update(...args);
      };
      card.setConfig(config(layout));
      document.body.append(card);
      return card;
    };
    const ready = async (card) => {
      await wait(
        () =>
          card.contentEl.style.visibility === "" &&
          card.contentEl._fullData?.length === 1,
      );
      await settle();
      check(!card.errorMsgEl.textContent, card.errorMsgEl.textContent);
    };
    const resize = async (card, width, expected = width) => {
      card.style.width = `${width}px`;
      await wait(() => card.contentEl._fullLayout.width === expected);
      await settle();
    };

    let card = create();
    await ready(card);
    let before = { ...counts };
    const data = card.contentEl.data;
    await resize(card, 620);
    check(
      counts.parse === before.parse && counts.react === before.react,
      "Resize rebuilt the chart",
    );
    check(
      counts.relayout > before.relayout && card.contentEl.data === data,
      "Resize did not use relayout",
    );
    check(
      !card.isBrowsing && card.isInternalRelayout === 0,
      "Internal resize entered browsing mode",
    );
    results.push(
      "width-only relayout without config parsing or trace rebuilding",
    );

    before = { ...counts };
    card.style.width = "620px";
    await settle();
    check(
      JSON.stringify(counts) === JSON.stringify(before),
      "Unchanged size caused work",
    );
    results.push("unchanged size is ignored");

    card.style.display = "none";
    await settle();
    check(
      JSON.stringify(counts) === JSON.stringify(before),
      "Hidden card caused work",
    );
    card.style.width = "540px";
    card.style.display = "block";
    await wait(() => card.contentEl._fullLayout.width === 540);
    await settle();
    results.push("hidden card is skipped and resizes when shown");

    await Plotly.relayout(card.contentEl, {
      "xaxis.range": [
        new Date(Date.now() - 1800000).toISOString(),
        new Date().toISOString(),
      ],
    });
    await wait(() => card.isBrowsing);
    await settle();
    const range = JSON.stringify(card.contentEl.layout.xaxis.range);
    before = { ...counts };
    await resize(card, 580);
    check(
      card.isBrowsing &&
        JSON.stringify(card.contentEl.layout.xaxis.range) === range,
      "Resize lost zoom",
    );
    check(
      counts.parse === before.parse && counts.react === before.react,
      "Zoomed resize rebuilt chart",
    );
    results.push("browsing range survives resize");

    try {
      await card.withoutRelayout(() =>
        Promise.reject(new Error("test failure")),
      );
    } catch {}
    check(
      card.isInternalRelayout === 0,
      "Relayout suppression leaked after rejection",
    );
    await resize(card, 600);
    results.push("relayout suppression recovers after rejection");
    card.remove();

    card = create({ width: 350, height: 210 });
    await ready(card);
    before = { ...counts };
    await resize(card, 700, 350);
    check(
      card.contentEl._fullLayout.height === 210,
      "Explicit height overwritten",
    );
    check(
      JSON.stringify(counts) === JSON.stringify(before),
      "Explicit sizes caused resize work",
    );
    results.push("explicit width and height are preserved");
    card.remove();

    card = create({ height: 210 });
    await ready(card);
    await resize(card, 700);
    check(
      card.contentEl._fullLayout.height === 210,
      "Fixed height changed during width resize",
    );
    results.push("automatic width with explicit height");
    card.remove();

    card = create({}, 400);
    await ready(card);
    before = { ...counts };
    card.style.height = "500px";
    await wait(
      () =>
        card.size.height > 400 &&
        card.contentEl._fullLayout.height === card.size.height,
    );
    await settle();
    check(
      counts.parse === before.parse && counts.react === before.react,
      "Panel resize rebuilt chart",
    );
    results.push("panel height uses relayout");
    card.style.height = "auto";
    card.style.width = "500px";
    await wait(() => card.contentEl._fullLayout.height === 285);
    await settle();
    check(
      counts.parse > before.parse,
      "Leaving panel mode did not restore defaults",
    );
    results.push("panel to masonry restores default height");
    card.remove();

    card = create({ height: "$ex get('layout.width') / 2" });
    await ready(card);
    before = { ...counts };
    await resize(card, 640);
    check(
      card.contentEl._fullLayout.height === 320,
      "Dynamic height was not reevaluated",
    );
    check(
      counts.parse > before.parse,
      "Dynamic config did not use full render",
    );
    results.push("dimension-dependent expressions are reevaluated");
    card.remove();

    card = create();
    let release;
    let entered = false;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const update = card.configParser.update.bind(card.configParser);
    card.configParser.update = async (...args) => {
      entered = true;
      await gate;
      return update(...args);
    };
    await wait(() => entered);
    card.style.width = "660px";
    await wait(() => card.size.width === 660);
    release();
    await ready(card);
    await wait(() => card.contentEl._fullLayout.width === 660);
    results.push("resize during initial data loading is not lost");

    entered = false;
    const refreshGate = new Promise((resolve) => {
      release = resolve;
    });
    card.configParser.update = async (...args) => {
      entered = true;
      await refreshGate;
      return update(...args);
    };
    const refresh = card.plot({ should_fetch: false });
    await wait(() => entered);
    for (const width of [500, 600, 720]) {
      card.style.width = `${width}px`;
      await wait(() => card.size.width === width);
    }
    release();
    await refresh;
    await wait(() => card.contentEl._fullLayout.width === 720);
    await settle();
    results.push("resize during refresh keeps the latest dimensions");
    check(counts.fetch === 0, "Resize requested history");
    card.remove();

    card = create();
    await ready(card);
    const state = {
      entity_id: "sensor.resize_test",
      state: "42",
      attributes: { unit_of_measurement: "W" },
      last_changed: new Date(Date.now() - 3600000).toISOString(),
      last_updated: new Date(Date.now() - 3600000).toISOString(),
    };
    card.hass.states[state.entity_id] = state;
    card.hass.callApi = async () => {
      counts.fetch++;
      return [[state]];
    };
    const historyConfig = {
      ...config(),
      entities: [{ entity: state.entity_id }],
    };
    card.setConfig(historyConfig);
    await wait(() => counts.fetch > 0);
    await ready(card);
    before = { ...counts };
    await resize(card, 610);
    check(
      counts.fetch === before.fetch && counts.parse === before.parse,
      "History entity was reloaded on resize",
    );
    results.push("history-backed chart resizes without new HA requests");
    card.setConfig({
      ...historyConfig,
      layout: { height: "$ex get('layout.width') / 2" },
    });
    await wait(() => card.contentEl._fullLayout.height === 305);
    await settle();
    before = { ...counts };
    await resize(card, 680);
    check(
      counts.fetch === before.fetch && counts.parse > before.parse,
      "Dynamic fallback refetched history",
    );
    results.push("dynamic fallback reuses cached history");
    card.remove();
    return results;
  });
  assert.deepEqual(errors, []);
  console.log(
    `${results.length} resize browser checks passed:\n${results.join("\n")}`,
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

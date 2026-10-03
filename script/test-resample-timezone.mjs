import assert from "node:assert/strict";
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
  globalName: "ResampleTest",
  outdir: "dist",
  minify: true,
});
const fixtures = [
  {
    name: "HA UTC-7 instead of browser Hawaii (#384)",
    time_zone: "server",
    profile: "local",
    server: "America/Phoenix",
    dates: [5, 6, 7, 8].map((d) => `2024-03-0${d}T00:00:00-07:00`),
    expected: [5, 6, 7].map((d) => `2024-03-0${d}`),
  },
  {
    name: "HA profile and spring DST",
    profile: "server",
    server: "Europe/Zurich",
    dates: [
      "2024-03-30T00:00:00+01:00", "2024-03-31T00:00:00+01:00",
      "2024-04-01T00:00:00+02:00", "2024-04-02T00:00:00+02:00",
    ],
    expected: ["2024-03-30", "2024-03-31", "2024-04-01"],
  },
  {
    name: "HA profile and fall DST",
    profile: "server",
    server: "Europe/Zurich",
    dates: [
      "2024-10-26T00:00:00+02:00", "2024-10-27T00:00:00+02:00",
      "2024-10-28T00:00:00+01:00", "2024-10-29T00:00:00+01:00",
    ],
    expected: ["2024-10-26", "2024-10-27", "2024-10-28"],
  },
  {
    name: "card override with a fractional-hour timezone",
    time_zone: "Asia/Kathmandu",
    profile: "server",
    server: "Europe/Zurich",
    dates: [5, 6, 7, 8].map((d) => `2024-03-0${d}T00:00:00+05:45`),
    expected: [5, 6, 7].map((d) => `2024-03-0${d}`),
  },
  {
    name: "explicit browser-local calendar",
    time_zone: "local",
    profile: "server",
    server: "Europe/Zurich",
    dates: [5, 6, 7, 8].map((d) => `2024-03-0${d}T00:00:00-10:00`),
    expected: [5, 6, 7].map((d) => `2024-03-0${d}`),
  },
];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ timezoneId: "Pacific/Honolulu" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({
    content: bundle.outputFiles.find((file) => file.path.endsWith(".js")).text,
  });
  await page.evaluate(() => {
    customElements.define("ha-card", class extends HTMLElement {});
  });
  for (const fixture of fixtures) {
    const result = await page.evaluate(async (fixture) => {
      const { Plotly, PlotlyGraph } = ResampleTest;
      const card = new PlotlyGraph();
      // Test the actual render path without unrelated resize/refresh races.
      card.plot = async () => {};
      card.style.cssText = "display:block;width:480px";
      const requests = [];
      card.hass = {
        locale: { language: "en", first_weekday: "monday", time_zone: fixture.profile },
        config: { time_zone: fixture.server },
        states: {},
        callWS: async (request) => {
          requests.push(request);
          return {
            "sensor.temperature": fixture.dates.map((start, i) => ({
              start, mean: (i + 1) * 10,
            })),
          };
        },
      };
      await card.setConfig({
        type: "custom:plotly-graph",
        refresh_interval: 0,
        ...(fixture.time_zone ? { time_zone: fixture.time_zone } : {}),
        visible_range: [Date.parse(fixture.dates[0]), Date.parse(fixture.dates.at(-1))],
        entities: [{
          entity: "sensor.temperature",
          type: "bar",
          statistic: "mean",
          period: "day",
          filters: [{ resample: "1d" }],
        }],
      });
      document.body.append(card);
      await card._plot({ should_fetch: true });
      const result = {
        error: card.errorMsgEl.textContent,
        ys: card.contentEl.data[0].y,
        positions: card.contentEl.calcdata[0].map((point) => point.p),
        bars: card.contentEl.querySelectorAll(".barlayer .point path").length,
        requests,
      };
      card.remove();
      Plotly.purge(card.contentEl);
      return result;
    }, fixture);
    assert.equal(result.error, "", fixture.name);
    assert.deepEqual(result.ys, [10, 20, 30], fixture.name);
    assert.deepEqual(
      result.positions,
      fixture.expected.map((day) => Date.parse(`${day}T00:00:00Z`)),
      fixture.name,
    );
    assert.equal(result.bars, 3, fixture.name);
    assert.equal(result.requests.length, 1, fixture.name);
    assert.equal(result.requests[0].type, "recorder/statistics_during_period");
    console.log(`PASS: ${fixture.name}`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

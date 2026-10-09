import assert from "node:assert/strict";
import { bundleInMemory } from "../build.mjs";
import { chromium } from "playwright";

const [bundle] = await bundleInMemory({
  code: `export { default as Plotly } from './src/plotly';
      export { PlotlyGraph } from './src/plotly-graph-card';
      export const Registry = require('plotly.js/src/registry');`,
  name: "ZeroTest",
});
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({
    content: bundle.code,
  });
  const results = await page.evaluate(async () => {
    const { Plotly, PlotlyGraph, Registry } = ZeroTest;
    customElements.define(
      "ha-card",
      class extends HTMLElement {
        connectedCallback() {
          this.style.display = "block";
        }
      },
    );
    const card = new PlotlyGraph();
    // Drive renders explicitly so observer updates cannot cancel the awaited draw.
    const plot = card.plot.bind(card);
    card.plot = async () => {};
    card.style.cssText = "display:block;width:480px";
    const end = Date.now() - 60000;
    const start = end - 120000;
    const values = {
      "sensor.power": ["-10", "0", "100"],
      "sensor.price": ["10", "20", "40"],
    };
    card.hass = {
      states: Object.fromEntries(
        Object.entries(values).map(([entity_id, ys]) => [
          entity_id,
          {
            entity_id,
            state: ys.at(-1),
            attributes: {
              unit_of_measurement:
                entity_id === "sensor.power" ? "W" : "ct/kWh",
            },
            last_updated: new Date(end).toISOString(),
            last_changed: new Date(end).toISOString(),
          },
        ]),
      ),
      locale: { language: "en", first_weekday: "monday" },
      config: { time_zone: "UTC" },
      connection: {},
      callWS: async ({ type, entity_ids }) => {
        if (type !== "history/history_during_period")
          throw new Error(`Unexpected request: ${type}`);
        return Object.fromEntries(
          entity_ids.map((id) => [
            id,
            values[id].map((s, index) => ({
              s,
              lu: (start + index * 60000) / 1000,
            })),
          ]),
        );
      },
    };
    const config = {
      type: "custom:plotly-graph",
      refresh_interval: 0,
      visible_range: [start, end],
      entities: [
        {
          entity: "sensor.power",
          type: "scatter",
          name: "Power",
          extend_to_present: false,
          yaxis: "y",
        },
        {
          entity: "sensor.price",
          type: "scatter",
          name: "Price",
          extend_to_present: false,
          yaxis: "y2",
        },
      ],
      layout: {
        height: 320,
        yaxis: { type: "linear" },
        yaxis2: { type: "linear", overlaying: "y", side: "right" },
      },
    };
    const check = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const range = (axis) => card.contentEl._fullLayout[axis].range.slice();
    const close = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
    const sameRange = (a, b) => a.every((value, i) => close(value, b[i]));
    const aligned = () => {
      const { yaxis, yaxis2 } = card.contentEl._fullLayout;
      return (
        Math.abs(
          yaxis._offset + yaxis.d2p(0) - yaxis2._offset - yaxis2.d2p(0),
        ) < 0.01
      );
    };
    const draw = async (overrides = {}) => {
      await card.setConfig({ ...config, ...overrides });
      await plot({ should_fetch: true });
      const deadline = performance.now() + 5000;
      while (
        !card.contentEl._fullLayout ||
        card.isInternalRelayout ||
        card.parsed_config.align_zero !== card.config.align_zero
      ) {
        if (performance.now() > deadline)
          throw new Error("Card update did not finish");
        await new Promise(requestAnimationFrame);
      }
      check(!card.errorMsgEl.textContent, card.errorMsgEl.textContent);
    };
    card.config = config;
    document.body.append(card);
    try {
      await draw();
      const native = [range("yaxis"), range("yaxis2")];
      check(!aligned(), "Fixture was already aligned without the option");
      await draw({ align_zero: true });
      check(
        aligned(),
        "Zero lines are not aligned: " +
          JSON.stringify({
            option: card.parsed_config.align_zero,
            axes: ["yaxis", "yaxis2"].map((key) => {
              const axis = card.contentEl._fullLayout[key];
              return {
                key,
                range: axis.range,
                type: axis.type,
                autorange: axis.autorange,
                options: axis.autorangeoptions,
                overlaying: axis.overlaying,
                domain: axis.domain,
              };
            }),
          }),
      );
      for (const key of ["yaxis", "yaxis2"]) {
        check(
          card.contentEl._fullLayout[key].autorange === true,
          `${key}: autorange was disabled`,
        );
      }
      const initial = [range("yaxis"), range("yaxis2")];
      for (let i = 0; i < 2; i++) {
        check(
          initial[i][0] <= native[i][0] && initial[i][1] >= native[i][1],
          "Alignment clipped the native range",
        );
      }
      for (let i = 0; i < 5; i++) await plot({ should_fetch: false });
      check(
        sameRange(range("yaxis"), initial[0]) &&
          sameRange(range("yaxis2"), initial[1]),
        "Repeated renders grew the aligned ranges",
      );

      await Registry.call("_guiRelayout", card.contentEl, {
        "yaxis.range": [5, 20],
      });
      await plot({ should_fetch: false });
      check(
        sameRange(range("yaxis"), [5, 20]),
        "Alignment changed a user Y zoom",
      );
      check(
        card.contentEl._fullLayout.yaxis.autorange === false,
        "User zoom was reset to autorange",
      );

      await draw({
        align_zero: true,
        autorange_after_scroll: true,
        layout: {
          ...config.layout,
          yaxis: { range: [-10, 100] },
        },
      });
      check(
        card.contentEl._fullLayout.yaxis.autorange === true && aligned(),
        "autorange_after_scroll left an autoranged axis protected",
      );
      await draw({ align_zero: false });
      check(
        sameRange(range("yaxis"), native[0]) &&
          sameRange(range("yaxis2"), native[1]),
        "Disabling alignment did not restore native autorange",
      );
      return [
        "native autorange and pixel alignment",
        "stable repeated renders",
        "user Y zoom",
        "autorange after scroll",
        "disabled option",
      ];
    } finally {
      card.remove();
      Plotly.purge(card.contentEl);
    }
  });
  assert.deepEqual(errors, []);
  console.log(`Zero alignment: ${results.join(", ")}`);
} finally {
  await browser.close();
}

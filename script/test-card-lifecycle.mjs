import assert from "node:assert/strict";
import { bundleInMemory } from "../build.mjs";
import { chromium } from "playwright";

// Share the actual Plotly instance with the card so failures can be injected
// without replacing its event system or the card's render path.
const [bundle] = await bundleInMemory({
  code: `export { default as Plotly } from './src/plotly';
      export { PlotlyGraph } from './src/plotly-graph-card';`,
  name: "LifecycleTest",
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({
    content: bundle.code,
  });
  const results = await page.evaluate(async () => {
    const { Plotly, PlotlyGraph } = LifecycleTest;
    const results = [];
    const check = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const failure = new Error("Injected render failure");
    const rejects = async (operation) => {
      let caught;
      try {
        await operation();
      } catch (error) {
        caught = error;
      }
      check(caught === failure, "The original failure must reach the caller");
    };
    const realReact = Plotly.react;
    const realNewPlot = Plotly.newPlot;
    let emptyPlots = 0;
    Plotly.newPlot = (...args) => {
      emptyPlots++;
      return realNewPlot(...args);
    };
    customElements.define(
      "ha-card",
      class extends HTMLElement {
        connectedCallback() {
          this.style.display = "block";
        }
      },
    );
    const card = new PlotlyGraph();
    const noop = () => {};
    /** @type {[string, string, object | undefined][]} */
    const handlerEvents = [
      ["plotly_relayout", "onRelayout", {}],
      ["plotly_restyle", "onRestyle", {}],
      ["plotly_legendclick", "onLegendItemClick", { curveNumber: 0 }],
      [
        "plotly_legenddoubleclick",
        "onLegendItemDoubleclick",
        { curveNumber: 0 },
      ],
      ["plotly_click", "onDataClick", { points: [{ curveNumber: 0 }] }],
      ["plotly_doubleclick", "onDoubleclick", undefined],
      ["plotly_clickannotation", "onAnnotationClick", { annotation: {} }],
      ["plotly_buttonclicked", "onButtonClick", { button: { _input: {} } }],
    ];
    // Install counters before the card registers its handlers.
    const handlerCalls = {};
    for (const [, name] of handlerEvents) {
      const original = card[name];
      handlerCalls[name] = 0;
      card[name] = (...args) => {
        handlerCalls[name]++;
        return original(...args);
      };
    }
    check(
      emptyPlots === 0 && card.contentEl.data === undefined,
      "Constructor created an empty plot",
    );
    results.push("no empty constructor render");

    await rejects(() =>
      card.withoutRelayout(() => {
        throw failure;
      }),
    );
    check(
      card.isInternalRelayout === 0,
      "Synchronous failure left the guard set",
    );
    results.push("synchronous failure resets guard");
    await rejects(() => card.withoutRelayout(() => Promise.reject(failure)));
    check(card.isInternalRelayout === 0, "Rejected promise left the guard set");
    results.push("asynchronous failure resets guard");

    await card.withoutRelayout(async () => {
      check(card.isInternalRelayout === 1, "Outer guard not active");
      await rejects(() =>
        card.withoutRelayout(async () => {
          check(card.isInternalRelayout === 2, "Nested guard not active");
          throw failure;
        }),
      );
      check(
        card.isInternalRelayout === 1,
        "Nested failure cleared the outer guard",
      );
    });
    check(card.isInternalRelayout === 0, "Nested guard did not unwind");
    results.push("nested failure preserves outer guard");

    // Drive _plot explicitly; ResizeObserver and state changes must not race
    // the intentionally failed renders in this test.
    let requestedPlots = 0;
    card.plot = async () => {
      requestedPlots++;
    };
    card.hass = { states: {}, locale: { language: "en" } };
    await card.setConfig({ type: "custom:plotly-graph", entities: [] });
    const parsed = {
      entities: [
        {
          type: "scatter",
          x: [1, 2],
          y: [10, 20],
          on_click: noop,
          on_legend_click: noop,
          on_legend_dblclick: noop,
        },
      ],
      on_dblclick: noop,
      layout: { width: 480, height: 285 },
      config: { showSendToCloud: false },
      refresh_interval: 0,
      autorange_after_scroll: false,
    };
    card.configParser.update = async () => ({ errors: [], parsed });
    document.body.append(card);
    await new Promise(requestAnimationFrame);

    Plotly.react = async () => {
      throw failure;
    };
    await rejects(() => card._plot());
    check(
      card.isInternalRelayout === 0,
      "Failed first render left the guard set",
    );
    check(
      !card.plotlyListenersConnected,
      "Listeners connected before a successful render",
    );
    results.push("first render failure leaves recoverable state");

    Plotly.react = realReact;
    await card.setConfig({
      type: "custom:plotly-graph",
      entities: [],
      title: "Corrected",
    });
    await card._plot();
    const checkListeners = (count) => {
      for (const [event, name, payload] of handlerEvents) {
        const before = handlerCalls[name];
        card.contentEl.emit(event, payload);
        const actual = handlerCalls[name] - before;
        check(
          actual === count,
          `${event}: expected ${count} card listener(s), got ${actual}`,
        );
      }
      card.isBrowsing = false;
    };
    check(
      card.isInternalRelayout === 0 && card.plotlyListenersConnected,
      "Corrected config did not recover",
    );
    check(card.contentEl.style.visibility === "", "Recovered plot is hidden");
    checkListeners(1);
    results.push("corrected config connects every listener once");

    await card._plot();
    await card._plot();
    checkListeners(1);
    results.push("repeated renders do not duplicate listeners");
    const checkInteractions = () => {
      for (const event of ["plotly_relayout", "plotly_restyle"]) {
        const before = requestedPlots;
        card.contentEl.emit(event, {});
        check(
          requestedPlots === before + 1 && card.isBrowsing,
          `${event} was ignored or handled twice`,
        );
      }
      card.isBrowsing = false;
    };
    checkInteractions();
    await card.withoutRelayout(async () => {
      const before = requestedPlots;
      card.contentEl.emit("plotly_relayout", {});
      card.contentEl.emit("plotly_restyle", {});
      check(
        requestedPlots === before,
        "Internal events triggered another plot",
      );
    });
    results.push(
      "user interactions recover while internal events remain suppressed",
    );

    Plotly.react = async () => {
      throw failure;
    };
    await rejects(() => card._plot());
    check(
      card.isInternalRelayout === 0,
      "Later render failure left the guard set",
    );
    checkListeners(1);
    checkInteractions();
    Plotly.react = realReact;
    await card._plot();
    checkListeners(1);
    results.push("later render failure preserves working listeners");

    card.remove();
    checkListeners(0);
    document.body.append(card);
    await card._plot();
    checkListeners(1);
    checkInteractions();
    results.push("disconnect and reconnect do not duplicate listeners");

    Plotly.react = async (...args) => {
      const result = await realReact(...args);
      card.remove();
      return result;
    };
    await card._plot();
    check(
      !card.plotlyListenersConnected && card.isInternalRelayout === 0,
      "Disconnected render attached listeners",
    );
    checkListeners(0);
    Plotly.react = realReact;
    document.body.append(card);
    await card._plot();
    checkListeners(1);
    results.push("disconnect during render does not reattach listeners");

    card.remove();
    Plotly.purge(card.contentEl);
    Plotly.newPlot = realNewPlot;
    return results;
  });
  await page.evaluate(async () => {
    const { PlotlyGraph } = LifecycleTest;
    const log = {
      plots: [],
      dataClicks: [],
      legendClicks: [],
      legendResult: undefined,
      rangeResets: 0,
    };
    const card = new PlotlyGraph();
    card.id = "interaction-card";
    window.interaction = { card, log };
    card.plot = async (options) => {
      log.plots.push(options);
    };
    card.hass = { states: {}, locale: { language: "en" } };
    await card.setConfig({ type: "custom:plotly-graph", entities: [] });
    const entity = (name, y) => ({
      type: "scatter",
      mode: "markers",
      marker: { size: 14 },
      name,
      x: [1, 2, 3],
      y,
      on_click: ({ points }) =>
        log.dataClicks.push({ name, curveNumber: points[0].curveNumber }),
      on_legend_click: ({ curveNumber }) => {
        log.legendClicks.push({ name, curveNumber });
        return log.legendResult;
      },
      on_legend_dblclick: () => {},
    });
    const parsed = {
      entities: [entity("A", [1, 3, 2]), entity("B", [4, 5, 6])],
      layout: {
        width: 480,
        height: 285,
        showlegend: true,
        hovermode: "closest",
        dragmode: "pan",
      },
      config: { showSendToCloud: false, doubleClickDelay: 300 },
      refresh_interval: 0,
      autorange_after_scroll: false,
      on_dblclick: () => {},
    };
    card.configParser.update = async () => ({ errors: [], parsed });
    const resetObservedRange = card.configParser.resetObservedRange.bind(
      card.configParser,
    );
    card.configParser.resetObservedRange = () => {
      log.rangeResets++;
      return resetObservedRange();
    };
    document.body.append(card);
    await card._plot();
    await new Promise((resolve) => setTimeout(resolve, 100));
    log.plots.length = 0;
  });
  const fetchRequests = () =>
    page.evaluate(
      () =>
        interaction.log.plots.filter((options) => options?.should_fetch).length,
    );
  const card = page.locator("#interaction-card");
  const point = await card
    .locator(".scatterlayer .trace")
    .nth(1)
    .locator("path.point")
    .nth(1)
    .boundingBox();
  assert.ok(point, "Trace B's middle marker was not rendered");
  const px = point.x + point.width / 2;
  const py = point.y + point.height / 2;
  await page.mouse.move(px, py);
  await page.waitForTimeout(100); // Plotly throttles hover detection.
  await page.mouse.click(px, py);
  await page.waitForFunction(() => interaction.log.dataClicks.length > 0);
  assert.deepEqual(await page.evaluate(() => interaction.log.dataClicks), [
    { name: "B", curveNumber: 1 },
  ]);
  results.push("data click runs the clicked entity's on_click");

  await card.locator(".legend .traces").nth(0).locator(".legendtoggle").click();
  await page.waitForFunction(
    () => interaction.card.contentEl.data[0].visible === "legendonly",
  );
  const afterToggle = await page.evaluate(() => ({
    legendClicks: interaction.log.legendClicks,
    isBrowsing: interaction.card.isBrowsing,
    resetVisible: !interaction.card.resetButtonEl.classList.contains("hidden"),
  }));
  assert.deepEqual(afterToggle.legendClicks, [{ name: "A", curveNumber: 0 }]);
  assert.ok(
    afterToggle.isBrowsing,
    "Legend toggle did not enter browsing mode",
  );
  assert.ok(afterToggle.resetVisible, "Reset button not shown");
  assert.equal(
    await fetchRequests(),
    1,
    "Legend toggle did not request a fetch",
  );
  results.push("legend click toggles the trace and requests a fetch");

  await page.evaluate(() => {
    interaction.log.legendResult = false;
  });
  await card.locator(".legend .traces").nth(1).locator(".legendtoggle").click();
  await page.waitForFunction(() => interaction.log.legendClicks.length === 2);
  await page.waitForTimeout(500); // Longer than Plotly's doubleClickDelay.
  const visibility = await page.evaluate(
    () => interaction.card.contentEl.data[1].visible,
  );
  assert.ok(
    visibility === undefined || visibility === true,
    "Returning false did not leave the trace visible",
  );
  assert.equal(await fetchRequests(), 1, "Cancelled toggle requested a fetch");
  results.push("on_legend_click returning false cancels the toggle");

  await card.locator("button#reset").click();
  await page.waitForFunction(() => interaction.log.rangeResets > 0);
  assert.deepEqual(
    await page.evaluate(() => ({
      isBrowsing: interaction.card.isBrowsing,
      resetHidden: interaction.card.resetButtonEl.classList.contains("hidden"),
      rangeResets: interaction.log.rangeResets,
    })),
    { isBrowsing: false, resetHidden: true, rangeResets: 1 },
  );
  assert.equal(await fetchRequests(), 2, "Reset did not request a fetch");
  results.push("reset button exits browsing mode and refetches");
  await page.evaluate(() => {
    interaction.card.remove();
    LifecycleTest.Plotly.purge(interaction.card.contentEl);
  });
  assert.deepEqual(errors, []);
  console.log(`${results.length} card lifecycle checks passed`);
  console.log(results.join("\n"));
} finally {
  await browser.close();
}

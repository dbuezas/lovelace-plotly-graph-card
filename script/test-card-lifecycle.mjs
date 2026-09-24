import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

// Share the actual Plotly instance with the card so failures can be injected
// without replacing its event system or the card's render path.
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
  globalName: "LifecycleTest",
  outdir: "dist",
  minify: true,
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({
    content: bundle.outputFiles.find((file) => file.path.endsWith(".js")).text,
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
      entities: [{ type: "scatter", x: [1, 2], y: [10, 20] }],
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
    const listeners = [
      ["plotly_relayout", card.onRelayout],
      ["plotly_restyle", card.onRestyle],
      ["plotly_legendclick", card.onLegendItemClick],
      ["plotly_legenddoubleclick", card.onLegendItemDoubleclick],
      ["plotly_click", card.onDataClick],
      ["plotly_doubleclick", card.onDoubleclick],
      ["plotly_clickannotation", card.onAnnotationClick],
      ["plotly_buttonclicked", card.onButtonClick],
    ];
    const checkListeners = (count) => {
      for (const [event, callback] of listeners) {
        const actual = card.contentEl._ev
          .listeners(event)
          .filter((listener) => listener === callback).length;
        check(
          actual === count,
          `${event}: expected ${count} card listener(s), got ${actual}`,
        );
      }
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
  assert.deepEqual(errors, []);
  console.log(`${results.length} card lifecycle checks passed`);
  console.log(results.join("\n"));
} finally {
  await browser.close();
}

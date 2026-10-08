export function isTruthy<T>(x: T | null): x is T {
  return Boolean(x);
}

// Plotly adds its CSS to the document head, which doesn't reach the card's
// shadow DOM, so copy it in. Called after each load of Plotly modules, since
// lazily loaded chart types can add more.
const copyPlotlyStyles = (styleEl: HTMLStyleElement) => {
  const style = Array.from(
    document.querySelectorAll<Element & LinkStyle>(`style[id^="plotly.js"]`)
  )
    .map((styleEl) => styleEl.sheet)
    .filter(isTruthy)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .map((rule) => rule.cssText)
    .join("\n");

  const css = `
    .js-plotly-plot .plotly .modebar-btn {
      fill: rgb(136,136,136);
    }
    ${style}`;
  if (styleEl.textContent !== css) styleEl.textContent = css;
};
export default copyPlotlyStyles;

export function isTruthy<T>(x: T | null): x is T {
  return Boolean(x);
}

const insertStyleHack = (styleEl: HTMLStyleElement) => {
  const style = Array.from(
    document.querySelectorAll<Element & LinkStyle>(`style[id^="plotly.js"]`)
  )
    .map((styleEl) => styleEl.sheet)
    .filter(isTruthy)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .map((rule) => rule.cssText)
    .join("\n");

  styleEl.innerHTML += `
    .js-plotly-plot .plotly .modebar-btn {
      fill: rgb(136,136,136);
    }
    ${style}`;
};
export default insertStyleHack;

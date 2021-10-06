import { memo } from 'preact/compat'
import { h } from 'preact'

function isTruthy<T> (x: T | null): x is T {
  return Boolean(x)
}

const StyleHack = memo(() => {
  console.log('StyleHack')
  const style = Array.from(
    document.querySelectorAll<Element & LinkStyle>(`style[id^="plotly.js"]`)
  )
    .map(styleEl => styleEl.sheet)
    .filter(isTruthy)
    .flatMap(sheet => Array.from(sheet.cssRules))
    .map(rule => rule.cssText)
    .join('\n')

  return (
    <style>
      {`.js-plotly-plot .plotly .modebar-btn {
            fill: rgb(136,136,136);
        }
        ${style}`}
    </style>
  )
})
export default StyleHack

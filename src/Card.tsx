import { h } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { react as PlotlyReact } from 'plotly.js-dist'
import { HomeAssistant } from 'custom-card-helpers' // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers
import defaultLayout from './default-layout'
import StyleHack from './StyleHack'
import merge from 'lodash-es/merge'
import { useData, useWidth } from './hooks'
import { Config, Range } from './types'

declare module 'preact/src/jsx' {
  namespace JSXInternal {
    interface IntrinsicElements {
      'ha-card': any
    }
  }
}
type Props = {
  hass?: HomeAssistant
  config: Config
}
const Plotter = ({ config, hass }: Props) => {
  const container = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState<Range>([undefined, undefined])
  const { data, isLoading } = useData(hass, config, range)
  const width = useWidth(container.current)
  useEffect(() => {
    if (!container.current || width === 0) return
    const element = container.current
    console.log(width, 'replot')

    const layout = merge(defaultLayout, config.layout, { width })
    layout.title = isLoading
      ? {
          text: 'Loading...',
          xanchor: 'center',
          yanchor: 'middle',
          y: 0.5,
          font: { size: 40 }
        }
      : undefined

    PlotlyReact(element, data, layout)
    const zoomCallback = eventdata => {
      console.log(eventdata)
      if (eventdata['xaxis.showspikes'] === false)
        setRange([undefined, undefined]) // user clicked the home icon
      if (eventdata['xaxis.range[0]'])
        setRange([eventdata['xaxis.range[0]'], eventdata['xaxis.range[1]']])
    }
    const eventEmmitter = (element as any).on('plotly_relayout', zoomCallback)
    return () => eventEmmitter.off('plotly_relayout', zoomCallback)
  }, [width, isLoading, data, container.current, JSON.stringify(config.layout)])

  return (
    <ha-card>
      <StyleHack />
      <div ref={container}></div>
    </ha-card>
  )
}

export default Plotter

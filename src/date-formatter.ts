import { scaleTime } from "d3";
export const test = () => {
  const tickvals = scaleTime()
    .domain([new Date(2000, 0, 1, 3), new Date(2000, 0, 4, 2)])
    .ticks();
  const ticktext = tickvals.map(scaleTime().tickFormat());
  return { tickvals, ticktext };
};

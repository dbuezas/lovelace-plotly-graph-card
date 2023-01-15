getDataAndUnits(): { data: Plotly.Data[]; units: string[] } {
    if (!this.isBrowsing) {
      // to ensure the y axis autoranges to the visible data
      removeOutOfRange(data, this.getAutoFetchRangeWithValueMargins());
    }
}


function removeOutOfRange(data: EntityData, range: TimestampRange) {
  let first = -1;

  for (let i = 0; i < data.xs.length; i++) {
    if (+data.xs[i]! < range[0]) first = i;
  }
  if (first > -1) {
    // todo: cap to range instead of removing so autorange works nice
    data.xs.splice(0, first);
    data.ys.splice(0, first);
    data.states.splice(0, first);
    data.statistics.splice(0, first);
  }
  let last = -1;
  for (let i = data.xs.length - 1; i >= 0; i--) {
    if (+data.xs[i]! > range[1]) last = i;
  }
  if (last > -1) {
    data.xs.splice(last);
    data.ys.splice(last);
    data.states.splice(last);
    data.statistics.splice(last);
  }
  
}
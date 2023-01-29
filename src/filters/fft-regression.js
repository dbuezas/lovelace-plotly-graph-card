import fft from "ndarray-fft";
import ndarray from "ndarray";
import BaseRegression, { checkArrayLength } from "ml-regression-base";

export default class FFTRegression extends BaseRegression {
  x0 = 0;
  dt = 0;
  filtered = [];
  constructor(x, y, degree) {
    super();
    if (x === true) {
      throw new Error("not implemented");
    } else {
      checkArrayLength(x, y);
      this._regress(x, y, degree);
    }
  }
  _regress(x, y, degree) {
    var re = ndarray(new Float64Array(y)); //, [y.length,1])
    var im = ndarray(new Float64Array(Array(y.length).fill(0))); //, [y.length,1])
    fft(1, re, im);
    this.x0 = x[0];
    this.dt = (x[x.length - 1] - x[0]) / x.length;
    // coefficients beyond the degree are zeroed
    const sorted = Array.from(re.data)
      .map((x, i) => [x, i])
      .sort((a, b) => b[0] - a[0]);

    for (let i = degree; i < sorted.length; i++) {
      re.set(sorted[i][1], 0);
      im.set(sorted[i][1], 0);
    }
    fft(-1, re, im);
    this.filtered = re.data;
  }

  toJSON() {
    throw new Error("not implemented");
  }

  _predict(x) {
    return this.filtered[
      Math.round((x - this.x0) / this.dt) % this.filtered.length
    ];
  }

  computeX(y) {
    return "not implemented";
  }

  toString(precision) {
    return "not implemented";
  }

  toLaTeX(precision) {
    return this.toString(precision);
  }

  static load(json) {
    throw new Error("not implemented");
  }
}

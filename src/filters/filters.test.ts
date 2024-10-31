import filters, { FilterInput } from "./filters";

const RIGHT_1 = { integrate: { offset: "2d" } } satisfies FilterInput;
const RIGHT_11 = { integrate: "d" } satisfies FilterInput;
const RIGHT_2 = "integrate" satisfies FilterInput;
const RIGHT_3 = "delta" satisfies FilterInput;
const RIGHT_4 = "deduplicate_adjacent" satisfies FilterInput;
const RIGHT_5 = "force_numeric" satisfies FilterInput;
const RIGHT_6 = "resample" satisfies FilterInput;
const RIGHT_7 = { resample: "5m" } satisfies FilterInput;

//@ts-expect-error
const WRONG_1 = "add" satisfies FilterInput;
//@ts-expect-error
const WRONG_2 = { integrate: 3 } satisfies FilterInput;

const data = {
  states: [],
  statistics: [],
  ys: [0, 1, null, 2],
  xs: [
    "2022-12-20T18:07:28.000Z",
    "2022-12-20T18:07:29.000Z",
    "2022-12-20T18:07:29.500Z",
    "2022-12-20T18:07:30.000Z",
  ].map((s) => new Date(s)),
  attributes: {
    unit_of_measurement: "w",
  },
  history: [],
  vars: {},
  meta: {} as any,
  hass: {} as any,
};

describe("filters", () => {
  it("offset", () => {
    expect(filters.add(-1)(data)).toEqual({
      attributes: {
        unit_of_measurement: "w",
      },
      xs: [
        new Date("2022-12-20T18:07:28.000Z"),
        new Date("2022-12-20T18:07:29.000Z"),
        new Date("2022-12-20T18:07:30.000Z"),
      ],
      ys: [-1, 0, 1],
    });
  });
  it("multiply * 2", () => {
    expect(filters.multiply(2)(data)).toEqual({
      attributes: {
        unit_of_measurement: "w",
      },
      xs: [
        new Date("2022-12-20T18:07:28.000Z"),
        new Date("2022-12-20T18:07:29.000Z"),
        new Date("2022-12-20T18:07:30.000Z"),
      ],
      ys: [0, 2, 4],
    });
  });
  it("calibrate", () => {
    expect(filters.calibrate_linear(["1 -> 11", "11 -> 21"])(data)).toEqual({
      attributes: {
        unit_of_measurement: "w",
      },
      xs: [
        new Date("2022-12-20T18:07:28.000Z"),
        new Date("2022-12-20T18:07:29.000Z"),
        new Date("2022-12-20T18:07:30.000Z"),
      ],
      ys: [1, 11, 21],
    });
  });
  it("derivate", () => {
    expect(filters.derivate("s")(data)).toEqual({
      attributes: {
        unit_of_measurement: "w/s",
      },
      xs: [
        new Date("2022-12-20T18:07:29.000Z"),
        new Date("2022-12-20T18:07:30.000Z"),
      ],
      ys: [1, 1],
    });
  });
  it("integrate", () => {
    expect(filters.integrate("s")(data)).toEqual({
      attributes: {
        unit_of_measurement: "w*s",
      },
      xs: [
        new Date("2022-12-20T18:07:29.000Z"),
        new Date("2022-12-20T18:07:30.000Z"),
      ],
      ys: [1, 3],
    });
  });
  it("map_x", () => {
    expect(filters.map_x(`new Date(x.setHours(1))`)(data)).toEqual({
      attributes: {
        unit_of_measurement: "w",
      },
      xs: [
        new Date("2022-12-20T00:07:28.000Z"),
        new Date("2022-12-20T00:07:29.000Z"),
        new Date("2022-12-20T00:07:30.000Z"),
      ],
      ys: [0, 1, 2],
    });
  });
  it("map_y", () => {
    expect(filters.map_y(`Math.sqrt(y)`)(data)).toEqual({
      attributes: {
        unit_of_measurement: "w",
      },
      xs: [
        new Date("2022-12-20T00:07:28.000Z"),
        new Date("2022-12-20T00:07:29.000Z"),
        new Date("2022-12-20T00:07:30.000Z"),
      ],

      ys: [0, 1, 1.4142135623730951],
    });
  });
  it("fn", () => {
    expect(
      filters.fn(`({xs,ys,...rest}) => ({xs:ys, ys:xs,...rest})`)(data),
    ).toEqual({
      attributes: {
        unit_of_measurement: "w",
      },
      xs: [0, 1, 2],
      ys: [
        new Date("2022-12-20T00:07:28.000Z"),
        new Date("2022-12-20T00:07:29.000Z"),
        new Date("2022-12-20T00:07:30.000Z"),
      ],
    });
  });
});

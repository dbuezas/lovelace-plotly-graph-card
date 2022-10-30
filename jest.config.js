/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  maxWorkers: 1,
  moduleNameMapper: {
    d3: "<rootDir>/node_modules/d3/dist/d3.js",
  },
  diagnostics: {
    exclude: ["!**/*.(spec|test).ts?(x)"], // ts-jest is picking the wrong d3 types
  },
};

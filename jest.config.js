/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  transform: {
    "^.+\\.[tj]sx?$": ["ts-jest", { tsconfig: { allowJs: true } }],
  },
  testEnvironment: "node",
  // yaml-editor is a separate package whose tests run with `node --test`
  roots: ["<rootDir>/src"],
  maxWorkers: 1, // this makes local testing faster
};

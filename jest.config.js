/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  transform: {
    "^.+\\.[tj]sx?$": ["ts-jest", { tsconfig: { allowJs: true } }],
  },
  testEnvironment: "node",
  maxWorkers: 1, // this makes local testing faster
};

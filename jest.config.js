/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+.tsx?$": ["ts-jest",{}],
  },
  collectCoverage: true,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/*.factories.{ts,tsx}",
    "!src/desktop/extension.ts",
  ],
  coverageDirectory: "./coverage",
  coverageReporters: [
    "lcov",
    "text"
  ]
};

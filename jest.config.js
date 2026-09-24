/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  setupFiles: ["<rootDir>/tests/test-env.ts"],
  globalSetup: "<rootDir>/tests/global-setup.ts",
  clearMocks: true,
  collectCoverageFrom: ["src/**/*.ts"],
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["text", "lcov"],
};
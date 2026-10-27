const shared = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/setup/loadTestEnv.js"],
};

module.exports = {
  verbose: true,
  collectCoverageFrom: ["src/**/*.js", "!src/server.js"],
  projects: [
    // Pure logic, no database: fast, runnable anywhere.
    { ...shared, displayName: "unit", testMatch: ["<rootDir>/tests/unit/**/*.test.js"] },
    // Real HTTP + MySQL. globalSetup (schema migration) only runs when this
    // project has tests selected.
    {
      ...shared,
      displayName: "integration",
      testMatch: ["<rootDir>/tests/integration/**/*.test.js"],
      globalSetup: "<rootDir>/tests/setup/globalSetup.js",
    },
  ],
};

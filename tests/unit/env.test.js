const VALID = {
  NODE_ENV: "development",
  DATABASE_URL: "mysql://u:p@localhost:3306/lifeos",
  JWT_ACCESS_SECRET: "access_secret_long_enough",
  JWT_REFRESH_SECRET: "refresh_secret_long_enough",
};

// Loads src/config/env with exactly these variables (no .env file).
function loadEnv(vars) {
  const saved = process.env;
  process.env = { ...vars };
  try {
    let env;
    jest.isolateModules(() => {
      jest.doMock("dotenv", () => ({ config: () => ({}) }));
      env = require("../../src/config/env");
    });
    return env;
  } finally {
    process.env = saved;
  }
}

describe("env config", () => {
  it("applies defaults and parses lists and flags", () => {
    const env = loadEnv({
      ...VALID,
      CORS_ORIGIN: "http://a.test, http://b.test",
      RATE_LIMIT_ENABLED: "false",
      TRUST_PROXY: "1",
    });
    expect(env).toMatchObject({
      port: 3000,
      corsOrigin: ["http://a.test", "http://b.test"],
      rateLimitEnabled: false,
      schedulerEnabled: true,
      trustProxy: 1,
      mail: { transport: "log" },
      jwt: { accessExpiresIn: "15m", refreshExpiresIn: "7d" },
    });
  });

  it("allows any origin outside production when CORS_ORIGIN is unset", () => {
    expect(loadEnv(VALID).corsOrigin).toBe(true);
  });

  it.each([
    ["a missing variable", { ...VALID, DATABASE_URL: undefined }, /DATABASE_URL/],
    ["a non-MySQL URL", { ...VALID, DATABASE_URL: "postgres://x" }, /mysql:\/\//],
    ["a short secret", { ...VALID, JWT_ACCESS_SECRET: "short" }, /JWT_ACCESS_SECRET/],
    ["a bad flag", { ...VALID, SCHEDULER_ENABLED: "yes" }, /SCHEDULER_ENABLED/],
    [
      "equal JWT secrets",
      { ...VALID, JWT_REFRESH_SECRET: VALID.JWT_ACCESS_SECRET },
      /must be different/,
    ],
    ["production without CORS_ORIGIN", { ...VALID, NODE_ENV: "production" }, /CORS_ORIGIN/],
  ])("fails fast on %s", (_, vars, message) => {
    const defined = Object.fromEntries(Object.entries(vars).filter(([, v]) => v !== undefined));
    expect(() => loadEnv(defined)).toThrow(message);
  });
});

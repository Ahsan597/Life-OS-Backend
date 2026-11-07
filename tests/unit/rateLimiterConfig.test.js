const express = require("express");
const request = require("supertest");
const { errorHandler } = require("../../src/middlewares/errorHandler");

// The app's limiters are disabled in tests (.env.test); load them enabled.
function loadLimiters() {
  const saved = process.env.RATE_LIMIT_ENABLED;
  process.env.RATE_LIMIT_ENABLED = "true";
  try {
    let limiters;
    jest.isolateModules(() => {
      limiters = require("../../src/middlewares/rateLimiter");
    });
    return limiters;
  } finally {
    process.env.RATE_LIMIT_ENABLED = saved;
  }
}

describe("configured rate limiters", () => {
  const { apiLimiter, exportLimiter } = loadLimiters();

  it("the API limiter exempts health checks", async () => {
    const app = express();
    app.use("/api/v1", apiLimiter, (req, res) => res.json({ ok: true }));

    const health = await request(app).get("/api/v1/health");
    const other = await request(app).get("/api/v1/habits");

    expect(health.headers.ratelimit).toBeUndefined();
    expect(other.headers.ratelimit).toMatch(/300-in-15min/);
  });

  it("the export limiter counts per user, not per IP", async () => {
    const app = express();
    app.get(
      "/export",
      (req, res, next) => {
        req.user = { id: BigInt(req.get("x-user")) };
        next();
      },
      exportLimiter,
      (req, res) => res.json({ ok: true })
    );
    app.use(errorHandler);
    const exportAs = (user) => request(app).get("/export").set("x-user", user);

    for (let i = 0; i < 10; i++) expect((await exportAs("1")).status).toBe(200);
    const limited = await exportAs("1");
    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatch(/Export limit/);

    // Same IP, different user: unaffected.
    expect((await exportAs("2")).status).toBe(200);
  });
});

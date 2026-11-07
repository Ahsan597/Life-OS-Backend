const express = require("express");
const request = require("supertest");
const { createRateLimiter } = require("../../src/middlewares/rateLimiter");
const { errorHandler } = require("../../src/middlewares/errorHandler");

function appWith(limiter) {
  const app = express();
  app.get("/ok", limiter, (req, res) => res.json({ ok: true }));
  app.get("/fail", limiter, (req, res) => res.status(401).json({ error: "nope" }));
  app.use(errorHandler);
  return app;
}

describe("rate limiter", () => {
  it("returns 429 in the usual error shape once the limit is hit", async () => {
    const app = appWith(
      createRateLimiter({ enabled: true, windowMs: 60_000, limit: 2, message: "Slow down" })
    );

    expect((await request(app).get("/ok")).status).toBe(200);
    expect((await request(app).get("/ok")).status).toBe(200);
    const res = await request(app).get("/ok");

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "Slow down" });
    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.headers.ratelimit).toBeDefined();
  });

  it("can count only failed requests", async () => {
    const app = appWith(
      createRateLimiter({
        enabled: true,
        windowMs: 60_000,
        limit: 1,
        skipSuccessfulRequests: true,
        message: "Too many failures",
      })
    );

    for (let i = 0; i < 3; i++) expect((await request(app).get("/ok")).status).toBe(200);
    expect((await request(app).get("/fail")).status).toBe(401);
    expect((await request(app).get("/fail")).status).toBe(429);
  });

  it("is a no-op when disabled", async () => {
    const app = appWith(createRateLimiter({ enabled: false, limit: 1, message: "x" }));
    for (let i = 0; i < 3; i++) expect((await request(app).get("/ok")).status).toBe(200);
  });
});

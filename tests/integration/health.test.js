const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/prisma");

describe("GET /api/v1/health", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns 200 and confirms the database connection is alive", async () => {
    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "connected" });
  });
});

describe("GET /api/v1/unknown-route", () => {
  it("returns 404 for a route that does not exist", async () => {
    const res = await request(app).get("/api/v1/unknown-route");

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

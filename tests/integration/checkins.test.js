const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/prisma");
const { getTodayForUser, addDays } = require("../../src/utils/dateUtils");

const EMAIL_DOMAIN = "@checkins-test.lifeos.local";
const PASSWORD = "correct-horse-battery";
const TIMEZONE = "America/Los_Angeles";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
}

async function registerUser(name) {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ email: `${name}${EMAIL_DOMAIN}`, password: PASSWORD, timezone: TIMEZONE });
  return `Bearer ${res.body.accessToken}`;
}

describe("Check-ins API", () => {
  let auth;
  const today = () => getTodayForUser(TIMEZONE);
  const post = (body, token = auth) =>
    request(app).post("/api/v1/checkins").set("Authorization", token).send(body);
  const get = (url, token = auth) => request(app).get(url).set("Authorization", token);

  beforeAll(async () => {
    await cleanup();
    auth = await registerUser("owner");
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/checkins");
    expect(res.status).toBe(401);
  });

  describe("POST /checkins", () => {
    it("creates today's check-in using the user's timezone", async () => {
      const res = await post({ mood: 4, energy: 3, sleepHours: 7.25, stressLevel: 2 });

      expect(res.status).toBe(201);
      expect(res.body.checkIn).toMatchObject({
        date: today(),
        mood: 4,
        energy: 3,
        sleepHours: 7.3,
        stressLevel: 2,
      });
    });

    it("updates the same day on a second post, keeping omitted fields", async () => {
      const res = await post({ mood: 5, note: "better evening" });

      expect(res.status).toBe(200);
      expect(res.body.checkIn).toMatchObject({
        date: today(),
        mood: 5,
        energy: 3,
        note: "better evening",
      });
    });

    it("rejects out-of-scale values and empty check-ins", async () => {
      expect((await post({ mood: 9 })).status).toBe(400);
      expect((await post({ note: "just a note" })).status).toBe(400);
    });

    it("rejects future dates", async () => {
      const res = await post({ mood: 3, date: addDays(today(), 1) });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /checkins", () => {
    beforeAll(async () => {
      // Past week: mood climbing 1 -> 3, stress falling 5 -> 3
      await post({ date: addDays(today(), -6), mood: 1, stressLevel: 5, sleepHours: 6 });
      await post({ date: addDays(today(), -4), mood: 2, stressLevel: 4, sleepHours: 7 });
      await post({ date: addDays(today(), -2), mood: 3, stressLevel: 3, sleepHours: 8 });
    });

    it("lists check-ins in a range, oldest first", async () => {
      const res = await get(
        `/api/v1/checkins?from=${addDays(today(), -5)}&to=${addDays(today(), -1)}`
      );

      expect(res.status).toBe(200);
      expect(res.body.checkIns.map((c) => c.date)).toEqual([
        addDays(today(), -4),
        addDays(today(), -2),
      ]);
    });

    it("defaults to the last 30 days", async () => {
      const res = await get("/api/v1/checkins");

      expect(res.body).toMatchObject({ from: addDays(today(), -29), to: today() });
      expect(res.body.checkIns).toHaveLength(4);
    });

    it("rejects ranges over a year", async () => {
      const res = await get(`/api/v1/checkins?from=${addDays(today(), -400)}&to=${today()}`);
      expect(res.status).toBe(400);
    });

    it("gets a single day's check-in, or 404", async () => {
      const found = await get(`/api/v1/checkins/${addDays(today(), -4)}`);
      expect(found.status).toBe(200);
      expect(found.body.checkIn.mood).toBe(2);

      const missing = await get(`/api/v1/checkins/${addDays(today(), -3)}`);
      expect(missing.status).toBe(404);

      const invalid = await get("/api/v1/checkins/2026-13-01");
      expect(invalid.status).toBe(400);
    });
  });

  describe("GET /checkins/stats", () => {
    it("returns averages and trend direction per metric", async () => {
      const res = await get(
        `/api/v1/checkins/stats?from=${addDays(today(), -6)}&to=${addDays(today(), -1)}`
      );

      expect(res.status).toBe(200);
      const { stats } = res.body;
      expect(stats).toMatchObject({ daysInRange: 6, daysCheckedIn: 3 });
      expect(stats.metrics.mood).toMatchObject({
        count: 3,
        average: 2,
        min: 1,
        max: 3,
        trend: "rising",
      });
      expect(stats.metrics.stressLevel.trend).toBe("falling");
      expect(stats.metrics.energy).toMatchObject({ count: 0, average: null, trend: null });
      expect(stats.series).toHaveLength(3);
    });
  });
});

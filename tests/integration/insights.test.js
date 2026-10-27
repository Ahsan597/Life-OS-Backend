const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/prisma");
const { getTodayForUser, addDays } = require("../../src/utils/dateUtils");

const EMAIL_DOMAIN = "@insights-test.lifeos.local";
const PASSWORD = "correct-horse-battery";
const TIMEZONE = "Asia/Karachi";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
}

async function registerUser(name) {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ email: `${name}${EMAIL_DOMAIN}`, password: PASSWORD, timezone: TIMEZONE });
  return `Bearer ${res.body.accessToken}`;
}

describe("Insights API", () => {
  let auth;
  let gymId;
  const today = () => getTodayForUser(TIMEZONE);
  const daysAgo = (n) => addDays(today(), -n);
  const get = (url, token = auth) => request(app).get(url).set("Authorization", token);
  const post = (url, body, token = auth) =>
    request(app).post(url).set("Authorization", token).send(body);
  const patch = (url, body, token = auth) =>
    request(app).patch(url).set("Authorization", token).send(body);

  async function createHabit(title) {
    const res = await post("/api/v1/habits", { title });
    return res.body.habit.id;
  }

  beforeAll(async () => {
    await cleanup();
    auth = await registerUser("owner");

    // 10 past days: "Read" is done exactly on the 8h-sleep days.
    const readId = await createHabit("Read");
    for (let i = 1; i <= 10; i++) {
      const date = daysAgo(i);
      const good = i % 2 === 0;
      await post("/api/v1/checkins", { date, sleepHours: good ? 8 : 5, mood: 3 });
      if (good) await post(`/api/v1/habits/${readId}/logs`, { date });
    }

    // "Gym": done 5 days ago, then missed 4 days in a row.
    gymId = await createHabit("Gym");
    await post(`/api/v1/habits/${gymId}/logs`, { date: daysAgo(5) });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/v1/insights/correlations")).status).toBe(401);
    expect((await request(app).get("/api/v1/insights/recommendations")).status).toBe(401);
  });

  describe("GET /insights/correlations", () => {
    it("correlates check-in metrics with habit completion, excluding today", async () => {
      const res = await get("/api/v1/insights/correlations");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        from: addDays(today(), -89),
        to: daysAgo(1),
        minSampleSize: 7,
      });

      const sleep = res.body.overall.find((c) => c.metric === "sleepHours");
      expect(sleep).toMatchObject({ sampleSize: 10, strength: "strong", direction: "positive" });
      expect(sleep.r).toBeGreaterThan(0.5);
      expect(sleep.buckets.find((b) => b.label === "8h+").days).toBe(5);

      const mood = res.body.overall.find((c) => c.metric === "mood");
      expect(mood.strength).toBe("no_variation");

      const read = res.body.habits.find((h) => h.title === "Read");
      const readSleep = read.correlations.find((c) => c.metric === "sleepHours");
      expect(readSleep).toMatchObject({ r: 1, strength: "strong" });

      expect(res.body.highlights.length).toBeGreaterThan(0);
      expect(res.body.highlights[0].metric).toBe("sleepHours");
    });

    it("validates the range", async () => {
      const res = await get(`/api/v1/insights/correlations?from=${today()}&to=${daysAgo(3)}`);
      expect(res.status).toBe(400);
    });
  });

  describe("recommendations", () => {
    let missedRec;

    it("generates a missed-in-a-row recommendation", async () => {
      const res = await get("/api/v1/insights/recommendations");

      expect(res.status).toBe(200);
      missedRec = res.body.recommendations.find(
        (r) => r.rule === "missed_in_a_row" && r.habitId === gymId
      );
      expect(missedRec).toMatchObject({
        habitTitle: "Gym",
        status: "pending",
        source: "rule_based",
      });
      expect(missedRec.message).toContain("4 times in a row");
    });

    it("dismissing keeps it dismissed and never duplicates it", async () => {
      const res = await patch(`/api/v1/insights/recommendations/${missedRec.id}`, {
        status: "dismissed",
      });
      expect(res.status).toBe(200);
      expect(res.body.recommendation.status).toBe("dismissed");

      const pending = await get("/api/v1/insights/recommendations");
      expect(pending.body.recommendations.some((r) => r.id === missedRec.id)).toBe(false);

      const all = await get("/api/v1/insights/recommendations?status=all");
      const gymMissed = all.body.recommendations.filter(
        (r) => r.rule === "missed_in_a_row" && r.habitId === gymId
      );
      expect(gymMissed).toHaveLength(1);
      expect(gymMissed[0].status).toBe("dismissed");
    });

    it("drops a pending recommendation once it no longer applies", async () => {
      const walkId = await createHabit("Walk");
      await post(`/api/v1/habits/${walkId}/logs`, { date: daysAgo(4) });

      const before = await get("/api/v1/insights/recommendations");
      expect(before.body.recommendations.some((r) => r.habitId === walkId)).toBe(true);

      await post(`/api/v1/habits/${walkId}/logs`, {});
      const after = await get("/api/v1/insights/recommendations");
      expect(after.body.recommendations.some((r) => r.habitId === walkId)).toBe(false);
    });

    it("validates status and ownership", async () => {
      const bad = await patch(`/api/v1/insights/recommendations/${missedRec.id}`, {
        status: "pending",
      });
      expect(bad.status).toBe(400);

      const badQuery = await get("/api/v1/insights/recommendations?status=nope");
      expect(badQuery.status).toBe(400);

      const other = await registerUser("other");
      const res = await patch(
        `/api/v1/insights/recommendations/${missedRec.id}`,
        { status: "accepted" },
        other
      );
      expect(res.status).toBe(404);

      const missing = await patch("/api/v1/insights/recommendations/999999999", {
        status: "accepted",
      });
      expect(missing.status).toBe(404);
    });
  });
});

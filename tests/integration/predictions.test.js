const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/prisma");
const { getTodayForUser, addDays } = require("../../src/utils/dateUtils");

const EMAIL_DOMAIN = "@predictions-test.lifeos.local";
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

describe("Predictions API", () => {
  let auth;
  let flossId;
  let runId;
  let newId;
  const today = () => getTodayForUser(TIMEZONE);
  const daysAgo = (n) => addDays(today(), -n);
  const get = (url, token = auth) => request(app).get(url).set("Authorization", token);
  const post = (url, body, token = auth) =>
    request(app).post(url).set("Authorization", token).send(body);

  async function createHabit(title) {
    const res = await post("/api/v1/habits", { title });
    return res.body.habit.id;
  }

  beforeAll(async () => {
    await cleanup();
    auth = await registerUser("owner");

    // "Floss": done every day for the last 14 days.
    flossId = await createHabit("Floss");
    for (let i = 1; i <= 14; i++)
      await post(`/api/v1/habits/${flossId}/logs`, { date: daysAgo(i) });

    // "Run": done 14-8 days ago, then missed the last 7 days.
    runId = await createHabit("Run");
    for (let i = 8; i <= 14; i++) await post(`/api/v1/habits/${runId}/logs`, { date: daysAgo(i) });

    // "New": created today, no history.
    newId = await createHabit("New");
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/v1/predictions/streak-risk")).status).toBe(401);
    expect((await request(app).get("/api/v1/predictions/accuracy")).status).toBe(401);
  });

  describe("GET /predictions/streak-risk", () => {
    it("forecasts each active habit, riskiest first", async () => {
      const res = await get("/api/v1/predictions/streak-risk");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ date: today(), modelVersion: "heuristic_v1" });
      expect(res.body.habits.map((h) => h.habitId)).toEqual([runId, flossId, newId]);

      const [run, floss, fresh] = res.body.habits;
      expect(run).toMatchObject({
        title: "Run",
        riskLevel: "high",
        currentStreak: 0,
        target: { period: "day", date: today(), current: true },
      });
      expect(run.factors.some((f) => f.factor === "miss_run")).toBe(true);
      expect(floss).toMatchObject({ riskLevel: "low", currentStreak: 14 });
      expect(fresh).toMatchObject({ riskLevel: "insufficient_data", confidence: "low" });
    });

    it("moves the forecast to tomorrow once today is done", async () => {
      await post(`/api/v1/habits/${flossId}/logs`, {});
      const res = await get("/api/v1/predictions/streak-risk");
      const floss = res.body.habits.find((h) => h.habitId === flossId);
      expect(floss.target).toEqual({ period: "day", date: addDays(today(), 1), current: false });
      expect(floss.currentStreak).toBe(15);
    });

    it("never shows another user's habits", async () => {
      const res = await get("/api/v1/predictions/streak-risk", await registerUser("other"));
      expect(res.status).toBe(200);
      expect(res.body.habits).toEqual([]);
    });
  });

  describe("GET /predictions/accuracy", () => {
    it("backtests the model over past days", async () => {
      const res = await get(`/api/v1/predictions/accuracy?from=${daysAgo(9)}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        from: daysAgo(9),
        to: daysAgo(1),
        modelVersion: "heuristic_v1",
      });
      // Floss and Run each forecast on 9 days ("New" has no history yet).
      expect(res.body.evaluated).toBe(18);
      expect(res.body.brierScore).toBeGreaterThanOrEqual(0);
      expect(res.body.byRiskLevel.map((g) => g.riskLevel)).toEqual(["low", "medium", "high"]);
      expect(res.body.calibration).toHaveLength(5);
    });

    it("validates the range", async () => {
      const res = await get(`/api/v1/predictions/accuracy?from=${today()}&to=${daysAgo(3)}`);
      expect(res.status).toBe(400);
    });
  });

  describe("ranked recommendations", () => {
    it("scores pending recommendations and orders them by score", async () => {
      const res = await get("/api/v1/insights/recommendations");

      expect(res.status).toBe(200);
      const scores = res.body.recommendations.map((r) => r.score);
      expect(scores.length).toBeGreaterThan(0);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));

      const runMissed = res.body.recommendations.find(
        (r) => r.rule === "missed_in_a_row" && r.habitId === runId
      );
      expect(runMissed).toMatchObject({ priority: expect.stringMatching(/^(high|medium|low)$/) });
      expect(runMissed.scoreFactors.habitRisk).toBeGreaterThan(1);
    });

    it("supports newest-first ordering and validates sort", async () => {
      const recent = await get("/api/v1/insights/recommendations?sort=recent");
      expect(recent.status).toBe(200);

      const bad = await get("/api/v1/insights/recommendations?sort=random");
      expect(bad.status).toBe(400);
    });
  });
});

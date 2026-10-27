const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/prisma");
const { getTodayForUser, addDays } = require("../../src/utils/dateUtils");

const EMAIL_DOMAIN = "@habits-test.lifeos.local";
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

describe("Habits API", () => {
  let auth;
  let otherAuth;
  const today = () => getTodayForUser(TIMEZONE);

  const api = {
    post: (url, body, token = auth) =>
      request(app).post(url).set("Authorization", token).send(body),
    put: (url, body, token = auth) => request(app).put(url).set("Authorization", token).send(body),
    patch: (url, body, token = auth) =>
      request(app).patch(url).set("Authorization", token).send(body),
    get: (url, token = auth) => request(app).get(url).set("Authorization", token),
    del: (url, token = auth) => request(app).delete(url).set("Authorization", token),
  };

  async function createHabit(body = { title: "Read 10 pages" }) {
    const res = await api.post("/api/v1/habits", body);
    return res.body.habit;
  }

  beforeAll(async () => {
    await cleanup();
    auth = await registerUser("owner");
    otherAuth = await registerUser("other");
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/habits");
    expect(res.status).toBe(401);
  });

  describe("CRUD", () => {
    it("creates a daily habit by default", async () => {
      const res = await api.post("/api/v1/habits", { title: "  Meditate  " });

      expect(res.status).toBe(201);
      expect(res.body.habit).toMatchObject({
        id: expect.any(String),
        title: "Meditate",
        frequency: "daily",
        targetDays: null,
        isActive: true,
      });
    });

    it("creates a custom habit with normalized target days", async () => {
      const res = await api.post("/api/v1/habits", {
        title: "Gym",
        frequency: "custom",
        targetDays: [5, 1, 3, 1],
      });

      expect(res.status).toBe(201);
      expect(res.body.habit.targetDays).toEqual([1, 3, 5]);
    });

    it("rejects a custom habit without target days", async () => {
      const res = await api.post("/api/v1/habits", { title: "Gym", frequency: "custom" });

      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe("targetDays");
    });

    it("lists active habits with today's status and streaks", async () => {
      const habit = await createHabit({ title: "Listed" });
      const res = await api.get("/api/v1/habits");

      expect(res.status).toBe(200);
      const listed = res.body.habits.find((h) => h.id === habit.id);
      expect(listed).toMatchObject({
        today: { date: today(), scheduled: true, completed: false },
        currentStreak: 0,
        longestStreak: 0,
      });
    });

    it("updates a habit and clears target days when leaving 'custom'", async () => {
      const habit = await createHabit({ title: "Swim", frequency: "custom", targetDays: [2] });
      const res = await api.put(`/api/v1/habits/${habit.id}`, {
        title: "Swim more",
        frequency: "weekly",
      });

      expect(res.status).toBe(200);
      expect(res.body.habit).toMatchObject({
        title: "Swim more",
        frequency: "weekly",
        targetDays: null,
      });
    });

    it("rejects an update that switches to 'custom' without target days", async () => {
      const habit = await createHabit();
      const res = await api.put(`/api/v1/habits/${habit.id}`, { frequency: "custom" });
      expect(res.status).toBe(400);
    });

    it("archives on delete: hidden from the list, still fetchable", async () => {
      const habit = await createHabit({ title: "To archive" });

      const del = await api.del(`/api/v1/habits/${habit.id}`);
      expect(del.status).toBe(204);

      const list = await api.get("/api/v1/habits");
      expect(list.body.habits.map((h) => h.id)).not.toContain(habit.id);

      const withArchived = await api.get("/api/v1/habits?includeArchived=true");
      expect(withArchived.body.habits.map((h) => h.id)).toContain(habit.id);

      const fetched = await api.get(`/api/v1/habits/${habit.id}`);
      expect(fetched.body.habit.isActive).toBe(false);
    });

    it("returns 404 for another user's habit", async () => {
      const habit = await createHabit();
      const res = await api.get(`/api/v1/habits/${habit.id}`, otherAuth);
      expect(res.status).toBe(404);
    });

    it("returns 400 for a malformed id", async () => {
      const res = await api.get("/api/v1/habits/abc");
      expect(res.status).toBe(400);
    });
  });

  describe("logs", () => {
    it("logs today by default, then updates the same day instead of duplicating", async () => {
      const habit = await createHabit();

      const first = await api.post(`/api/v1/habits/${habit.id}/logs`, {});
      expect(first.status).toBe(201);
      expect(first.body.log).toMatchObject({ date: today(), completed: true });

      const second = await api.post(`/api/v1/habits/${habit.id}/logs`, {
        completed: false,
        note: "skip",
      });
      expect(second.status).toBe(200);
      expect(second.body.log).toMatchObject({
        id: first.body.log.id,
        completed: false,
        note: "skip",
      });
    });

    it("rejects future dates", async () => {
      const habit = await createHabit();
      const res = await api.post(`/api/v1/habits/${habit.id}/logs`, { date: addDays(today(), 1) });
      expect(res.status).toBe(400);
    });

    it("rejects logging on an archived habit", async () => {
      const habit = await createHabit();
      await api.del(`/api/v1/habits/${habit.id}`);
      const res = await api.post(`/api/v1/habits/${habit.id}/logs`, {});
      expect(res.status).toBe(409);
    });

    it("lists logs filtered by date range", async () => {
      const habit = await createHabit();
      for (const offset of [-5, -3, -1]) {
        await api.post(`/api/v1/habits/${habit.id}/logs`, { date: addDays(today(), offset) });
      }

      const res = await api.get(
        `/api/v1/habits/${habit.id}/logs?from=${addDays(today(), -4)}&to=${today()}`
      );

      expect(res.status).toBe(200);
      expect(res.body.logs.map((l) => l.date)).toEqual([
        addDays(today(), -3),
        addDays(today(), -1),
      ]);
    });

    it("patches a log by id, but not another user's log", async () => {
      const habit = await createHabit();
      const { body } = await api.post(`/api/v1/habits/${habit.id}/logs`, {});

      const res = await api.patch(`/api/v1/logs/${body.log.id}`, { note: "felt great" });
      expect(res.status).toBe(200);
      expect(res.body.log).toMatchObject({ completed: true, note: "felt great" });

      const foreign = await api.patch(
        `/api/v1/logs/${body.log.id}`,
        { completed: false },
        otherAuth
      );
      expect(foreign.status).toBe(404);
    });
  });

  describe("GET /habits/:id/stats", () => {
    it("reports streaks and completion rate, including backfilled history", async () => {
      const habit = await createHabit();
      // Done 4 and 3 days ago, missed 2 days ago, done yesterday; today still open.
      for (const offset of [-4, -3, -1]) {
        await api.post(`/api/v1/habits/${habit.id}/logs`, { date: addDays(today(), offset) });
      }

      const res = await api.get(`/api/v1/habits/${habit.id}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.stats).toMatchObject({
        habitId: habit.id,
        currentStreak: 1,
        longestStreak: 2,
        from: addDays(today(), -4),
        to: today(),
        scheduled: 4,
        completed: 3,
        completionRate: 0.75,
      });
    });

    it("rejects an inverted date range", async () => {
      const habit = await createHabit();
      const res = await api.get(
        `/api/v1/habits/${habit.id}/stats?from=${today()}&to=${addDays(today(), -1)}`
      );
      expect(res.status).toBe(400);
    });
  });
});

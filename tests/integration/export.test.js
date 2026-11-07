const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/prisma");
const { getTodayForUser, addDays } = require("../../src/utils/dateUtils");

const EMAIL_DOMAIN = "@export-test.lifeos.local";
const TIMEZONE = "Asia/Karachi";
const BELL = String.fromCharCode(7);

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
}

describe("Export API", () => {
  let auth;
  let habitId;
  const today = () => getTodayForUser(TIMEZONE);
  const get = (url, token = auth) => request(app).get(url).set("Authorization", token);
  const post = (url, body) => request(app).post(url).set("Authorization", auth).send(body);

  beforeAll(async () => {
    await cleanup();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `owner${EMAIL_DOMAIN}`,
        password: "correct-horse-battery",
        timezone: TIMEZONE,
      });
    auth = `Bearer ${res.body.accessToken}`;

    // A title that is a spreadsheet formula, with a control character in it.
    const habit = await post("/api/v1/habits", {
      title: `=HYPERLINK("x")${BELL}`,
      description: "a, b",
    });
    habitId = habit.body.habit.id;
    await post(`/api/v1/habits/${habitId}/logs`, { date: addDays(today(), -1), note: "done" });
    await post("/api/v1/checkins", { mood: 4, sleepHours: 7.5 });
    await request(app).delete(`/api/v1/habits/${habitId}`).set("Authorization", auth);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/v1/export")).status).toBe(401);
  });

  it("strips control characters from text on input", async () => {
    const res = await get(`/api/v1/habits/${habitId}`);
    expect(res.body.habit.title).toBe('=HYPERLINK("x")');
  });

  it("downloads everything as one JSON file, archived habits included", async () => {
    const res = await get("/api/v1/export");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename="lifeos-export-${today()}.json"`
    );
    expect(res.headers["cache-control"]).toBe("no-store");

    const body = JSON.parse(res.text);
    expect(body).toMatchObject({ formatVersion: 1, user: { email: `owner${EMAIL_DOMAIN}` } });
    expect(body.habits).toHaveLength(1);
    expect(body.habits[0]).toMatchObject({ id: habitId, isActive: false });
    expect(body.habitLogs).toEqual([
      expect.objectContaining({ habitId, date: addDays(today(), -1), note: "done" }),
    ]);
    expect(body.checkIns).toEqual([expect.objectContaining({ mood: 4, sleepHours: 7.5 })]);
    expect(Array.isArray(body.recommendations)).toBe(true);
    expect(res.text).not.toMatch(/passwordHash|tokenHash/);
  });

  it("downloads one dataset as CSV, safe to open in a spreadsheet", async () => {
    const res = await get("/api/v1/export?format=csv&dataset=habits");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename="lifeos-habits-${today()}.csv"`
    );
    const [header, row] = res.text.split("\r\n");
    expect(header).toBe("id,title,description,frequency,targetDays,isActive,createdAt,updatedAt");
    expect(row.startsWith(`${habitId},"'=HYPERLINK(""x"")","a, b",daily,,false,`)).toBe(true);
  });

  it("validates format and dataset", async () => {
    expect((await get("/api/v1/export?format=csv")).status).toBe(400);
    expect((await get("/api/v1/export?format=xml")).status).toBe(400);
    expect((await get("/api/v1/export?format=csv&dataset=users")).status).toBe(400);
  });
});

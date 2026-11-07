const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/prisma");

const EMAIL_DOMAIN = "@users-test.lifeos.local";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
}

describe("Users API", () => {
  let auth;
  const get = (url) => request(app).get(url).set("Authorization", auth);
  const patch = (body) =>
    request(app).patch("/api/v1/users/me").set("Authorization", auth).send(body);

  beforeAll(async () => {
    await cleanup();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `owner${EMAIL_DOMAIN}`,
        password: "correct-horse-battery",
        name: "Owner",
        timezone: "Asia/Karachi",
      });
    auth = `Bearer ${res.body.accessToken}`;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/v1/users/me")).status).toBe(401);
  });

  it("returns the profile with default notification preferences", async () => {
    const res = await get("/api/v1/users/me");
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: `owner${EMAIL_DOMAIN}`,
      name: "Owner",
      timezone: "Asia/Karachi",
      preferences: { remindersEnabled: true, reminderTime: "20:00", emailReminders: false },
    });
    expect(res.body.user.passwordHash).toBeUndefined();

    // /auth/me returns the same shape.
    expect((await get("/api/v1/auth/me")).body.user).toEqual(res.body.user);
  });

  it("updates profile and preferences, leaving other fields alone", async () => {
    const res = await patch({
      name: "  New Name ",
      timezone: "Europe/London",
      preferences: { reminderTime: "07:30", emailReminders: true },
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: "New Name",
      timezone: "Europe/London",
      preferences: { remindersEnabled: true, reminderTime: "07:30", emailReminders: true },
    });

    const off = await patch({ preferences: { remindersEnabled: false } });
    expect(off.body.user.preferences).toEqual({
      remindersEnabled: false,
      reminderTime: "07:30",
      emailReminders: true,
    });
  });

  it("rejects a still-valid token whose account was deleted", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: `gone${EMAIL_DOMAIN}`, password: "correct-horse-battery" });
    await prisma.user.delete({ where: { email: `gone${EMAIL_DOMAIN}` } });

    const me = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(401);
  });

  it("ignores fields that can't be changed here", async () => {
    const res = await patch({ name: "Still Me", email: "hijack@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(`owner${EMAIL_DOMAIN}`);
  });

  it("validates input", async () => {
    const cases = [
      {},
      { preferences: {} },
      { timezone: "Mars/Base" },
      { preferences: { reminderTime: "24:00" } },
      { preferences: { reminderTime: "7:30" } },
      { preferences: { remindersEnabled: "yes" } },
      { name: "" },
    ];
    for (const body of cases) {
      const res = await patch(body);
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
    }
  });
});

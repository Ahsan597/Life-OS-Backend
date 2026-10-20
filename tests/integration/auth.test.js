const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/prisma");

const EMAIL_DOMAIN = "@auth-test.lifeos.local";
const email = (name) => `${name}${EMAIL_DOMAIN}`;
const PASSWORD = "correct-horse-battery";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
}

function register(body) {
  return request(app).post("/api/v1/auth/register").send(body);
}

describe("Auth API", () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe("POST /api/v1/auth/register", () => {
    it("creates a user and returns tokens without the password hash", async () => {
      const res = await register({
        email: email("Register"),
        password: PASSWORD,
        name: "Test User",
        timezone: "Asia/Karachi",
      });

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        email: email("register"),
        name: "Test User",
        timezone: "Asia/Karachi",
      });
      expect(res.body.user).not.toHaveProperty("passwordHash");
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
    });

    it("rejects a duplicate email with 409", async () => {
      await register({ email: email("dup"), password: PASSWORD });
      const res = await register({ email: email("dup"), password: PASSWORD });

      expect(res.status).toBe(409);
    });

    it("returns 409 (never 500) when the same email registers concurrently", async () => {
      const results = await Promise.all(
        [1, 2, 3].map(() => register({ email: email("race"), password: PASSWORD }))
      );

      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    });

    it("rejects a malformed JSON body with 400", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .set("Content-Type", "application/json")
        .send('{"email":');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Malformed JSON body");
    });

    it("rejects invalid input with 400 and field details", async () => {
      const res = await register({ email: "nope", password: "short", timezone: "Mars/Base" });

      expect(res.status).toBe(400);
      const fields = res.body.details.map((d) => d.field);
      expect(fields).toEqual(expect.arrayContaining(["email", "password", "timezone"]));
    });
  });

  describe("POST /api/v1/auth/login", () => {
    beforeAll(() => register({ email: email("login"), password: PASSWORD }));

    it("returns tokens for correct credentials", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: email("login"), password: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it("returns the same 401 for a wrong password and an unknown email", async () => {
      const wrongPassword = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: email("login"), password: "wrong-password" });
      const unknownEmail = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: email("ghost"), password: PASSWORD });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("returns the current user with a valid access token", async () => {
      const { body } = await register({ email: email("me"), password: PASSWORD });

      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${body.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(email("me"));
    });

    it("returns 401 without a token", async () => {
      const res = await request(app).get("/api/v1/auth/me");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("rotates the refresh token: the new one works, the old one does not", async () => {
      const { body } = await register({ email: email("refresh"), password: PASSWORD });

      const first = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: body.refreshToken });
      expect(first.status).toBe(200);
      expect(first.body.refreshToken).not.toBe(body.refreshToken);

      const replay = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: body.refreshToken });
      expect(replay.status).toBe(401);
    });

    it("revokes all sessions when a revoked token is replayed", async () => {
      const { body } = await register({ email: email("reuse"), password: PASSWORD });

      const rotated = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: body.refreshToken });
      // Attacker replays the old token -> everything for this user is revoked
      await request(app).post("/api/v1/auth/refresh").send({ refreshToken: body.refreshToken });

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: rotated.body.refreshToken });
      expect(res.status).toBe(401);
    });

    it("rejects a garbage token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "not-a-jwt" });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("revokes the refresh token so it can no longer be used", async () => {
      const { body } = await register({ email: email("logout"), password: PASSWORD });

      const res = await request(app)
        .post("/api/v1/auth/logout")
        .send({ refreshToken: body.refreshToken });
      expect(res.status).toBe(204);

      const refresh = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: body.refreshToken });
      expect(refresh.status).toBe(401);
    });

    it("is idempotent for an unknown token", async () => {
      const res = await request(app).post("/api/v1/auth/logout").send({ refreshToken: "unknown" });
      expect(res.status).toBe(204);
    });
  });
});

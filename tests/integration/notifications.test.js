const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/prisma");
const mailer = require("../../src/services/mailer");
const { runDailyReminders } = require("../../src/jobs/dailyReminders.job");
const { cleanupNotifications } = require("../../src/jobs");
const { getTodayForUser, addDays } = require("../../src/utils/dateUtils");

const EMAIL_DOMAIN = "@notifications-test.lifeos.local";
const PASSWORD = "correct-horse-battery";
// UTC+5 all year, so "16:00Z" is always 21:00 local.
const TIMEZONE = "Asia/Karachi";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
}

async function registerUser(name) {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ email: `${name}${EMAIL_DOMAIN}`, password: PASSWORD, timezone: TIMEZONE });
  return { auth: `Bearer ${res.body.accessToken}`, id: BigInt(res.body.user.id) };
}

describe("Reminders and notifications", () => {
  let owner;
  const today = () => getTodayForUser(TIMEZONE);
  // Instants on the user's current day, before and after the 20:00 reminder time.
  const beforeReminder = () => new Date(`${today()}T10:00:00Z`); // 15:00 local
  const afterReminder = () => new Date(`${today()}T16:00:00Z`); // 21:00 local
  const get = (url, auth = owner.auth) => request(app).get(url).set("Authorization", auth);
  const send = (method, url, body, auth = owner.auth) =>
    request(app)[method](url).set("Authorization", auth).send(body);

  const notificationsOf = (userId) => prisma.notification.findMany({ where: { userId } });

  beforeAll(async () => {
    await cleanup();
    owner = await registerUser("owner");
    await send("post", "/api/v1/habits", { title: "Read" });
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/v1/notifications")).status).toBe(401);
  });

  describe("daily reminder job", () => {
    it("waits for the user's reminder time", async () => {
      await runDailyReminders({ now: beforeReminder() });
      expect(await notificationsOf(owner.id)).toHaveLength(0);
    });

    it("creates one reminder per day, however often it runs", async () => {
      await runDailyReminders({ now: afterReminder() });
      await runDailyReminders({ now: afterReminder() });

      const rows = await notificationsOf(owner.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: "reminder",
        dedupeKey: `daily_reminder:${today()}`,
        title: "Your daily reminder",
        sentAt: null,
      });
      expect(rows[0].message).toBe(
        "1 habit left today: \"Read\". You haven't done today's check-in yet."
      );
      expect(rows[0].data).toMatchObject({ date: today(), checkInMissing: true });
    });

    it("stays quiet when everything is done", async () => {
      const done = await registerUser("done");
      const habit = await send("post", "/api/v1/habits", { title: "Walk" }, done.auth);
      await send("post", `/api/v1/habits/${habit.body.habit.id}/logs`, {}, done.auth);
      await send("post", "/api/v1/checkins", { mood: 4 }, done.auth);

      await runDailyReminders({ now: afterReminder() });
      expect(await notificationsOf(done.id)).toHaveLength(0);
    });

    it("skips users who turned reminders off", async () => {
      const off = await registerUser("off");
      await send(
        "patch",
        "/api/v1/users/me",
        { preferences: { remindersEnabled: false } },
        off.auth
      );

      await runDailyReminders({ now: afterReminder() });
      expect(await notificationsOf(off.id)).toHaveLength(0);
    });

    it("emails users who opted in, and marks it sent", async () => {
      const mailed = await registerUser("mailed");
      await send(
        "patch",
        "/api/v1/users/me",
        { preferences: { emailReminders: true } },
        mailed.auth
      );
      const spy = jest.spyOn(mailer, "send").mockResolvedValue();

      const counts = await runDailyReminders({ now: afterReminder() });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toMatchObject({
        to: `mailed${EMAIL_DOMAIN}`,
        subject: "Your daily reminder",
      });
      const [row] = await notificationsOf(mailed.id);
      expect(row.sentAt).not.toBeNull();
      expect(counts.emailed).toBe(1);
    });

    it("keeps the in-app reminder when the email fails", async () => {
      const broken = await registerUser("broken");
      await send(
        "patch",
        "/api/v1/users/me",
        { preferences: { emailReminders: true } },
        broken.auth
      );
      jest.spyOn(mailer, "send").mockRejectedValue(new Error("SMTP down"));

      await runDailyReminders({ now: afterReminder() });

      const [row] = await notificationsOf(broken.id);
      expect(row.sentAt).toBeNull();
    });

    it("one user's bad data doesn't stop everyone else's reminders", async () => {
      const bad = await registerUser("badtz");
      const good = await registerUser("good");
      // Only reachable by bypassing validation, e.g. a manual DB edit.
      await prisma.user.update({ where: { id: bad.id }, data: { timezone: "Not/AZone" } });

      const counts = await runDailyReminders({ now: afterReminder() });

      expect(counts.failed).toBe(1);
      expect(await notificationsOf(bad.id)).toHaveLength(0);
      expect(await notificationsOf(good.id)).toHaveLength(1);
      await prisma.user.delete({ where: { id: bad.id } });
    });
  });

  describe("notifications API", () => {
    let notificationId;

    beforeAll(async () => {
      // Two more for paging: yesterday's and an older insight.
      await prisma.notification.createMany({
        data: [
          {
            userId: owner.id,
            type: "reminder",
            dedupeKey: `daily_reminder:${addDays(today(), -1)}`,
            title: "Your daily reminder",
            message: "Yesterday",
          },
          {
            userId: owner.id,
            type: "insight",
            dedupeKey: "test:insight",
            title: "Hi",
            message: "Old",
          },
        ],
      });
    });

    it("lists newest first with an unread count and a cursor", async () => {
      const first = await get("/api/v1/notifications?limit=2");

      expect(first.status).toBe(200);
      expect(first.body.unreadCount).toBe(3);
      expect(first.body.notifications).toHaveLength(2);
      // The two rows inserted above are newer than the job's reminder.
      expect(first.body.notifications.map((n) => n.type)).toEqual(["insight", "reminder"]);
      expect(first.body.notifications[0].isRead).toBe(false);
      expect(Number(first.body.notifications[0].id)).toBeGreaterThan(
        Number(first.body.notifications[1].id)
      );
      expect(first.body.nextCursor).toBe(first.body.notifications[1].id);
      notificationId = first.body.notifications[0].id;

      const second = await get(`/api/v1/notifications?limit=2&before=${first.body.nextCursor}`);
      expect(second.body.notifications).toHaveLength(1);
      expect(second.body.nextCursor).toBeNull();
    });

    it("marks one as read and back", async () => {
      const read = await send("patch", `/api/v1/notifications/${notificationId}`, { isRead: true });
      expect(read.status).toBe(200);
      expect(read.body.notification).toMatchObject({ isRead: true });
      expect(read.body.notification.readAt).not.toBeNull();

      const unreadOnly = await get("/api/v1/notifications?unreadOnly=true");
      expect(unreadOnly.body.notifications.some((n) => n.id === notificationId)).toBe(false);

      const unread = await send("patch", `/api/v1/notifications/${notificationId}`, {
        isRead: false,
      });
      expect(unread.body.notification).toMatchObject({ isRead: false, readAt: null });
    });

    it("marks all as read", async () => {
      const res = await send("post", "/api/v1/notifications/read-all");
      expect(res.body).toEqual({ updated: 3 });
      expect((await get("/api/v1/notifications")).body.unreadCount).toBe(0);
    });

    it("validates and never touches another user's notifications", async () => {
      expect((await get("/api/v1/notifications?limit=500")).status).toBe(400);
      expect((await send("patch", `/api/v1/notifications/${notificationId}`, {})).status).toBe(400);

      const other = await registerUser("other");
      const res = await send(
        "patch",
        `/api/v1/notifications/${notificationId}`,
        { isRead: true },
        other.auth
      );
      expect(res.status).toBe(404);
    });
  });

  it("cleanup deletes notifications past retention", async () => {
    const future = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000);
    const { deleted } = await cleanupNotifications({ now: future });
    expect(deleted).toBeGreaterThanOrEqual(3);
    expect(await notificationsOf(owner.id)).toHaveLength(0);
  });
});

/**
 * Resets the demo account (demo@lifeos.dev / Demo@12345) with ~6 weeks of
 * realistic history so every screen, including Phase 2 insights, has data.
 *
 *   npm run seed:demo
 *
 * Deterministic (seeded PRNG): re-running produces the same history relative
 * to today. Only the demo user's data is touched. Refuses to run in production.
 */
require("dotenv").config({ quiet: true });
const bcrypt = require("bcrypt");
const prisma = require("../src/config/prisma");
const { getTodayForUser, addDays, dayOfWeek, toDbDate } = require("../src/utils/dateUtils");

const EMAIL = "demo@lifeos.dev";
const PASSWORD = "Demo@12345";
const TIMEZONE = "Asia/Karachi";
const HISTORY_DAYS = 42;

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

// mulberry32: tiny deterministic PRNG.
function prng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

async function main() {
  const random = prng(42);
  const today = getTodayForUser(TIMEZONE);
  const firstDay = addDays(today, -HISTORY_DAYS);
  // Habits "created" at noon on the first day, in UTC; close enough for a demo.
  const createdAt = new Date(`${firstDay}T12:00:00Z`);

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, passwordHash, name: "Demo User", timezone: TIMEZONE, createdAt },
    update: { passwordHash, name: "Demo User", timezone: TIMEZONE, createdAt },
  });

  // Logs cascade with habits.
  await prisma.$transaction([
    prisma.recommendation.deleteMany({ where: { userId: user.id } }),
    prisma.habit.deleteMany({ where: { userId: user.id } }),
    prisma.checkIn.deleteMany({ where: { userId: user.id } }),
  ]);

  const habit = (data) => prisma.habit.create({ data: { userId: user.id, createdAt, ...data } });
  const read = await habit({
    title: "Read 20 pages",
    description: "Before bed",
    frequency: "daily",
  });
  const gym = await habit({ title: "Gym", frequency: "custom", targetDays: [1, 3, 5] });
  const meditate = await habit({ title: "Meditate 10 min", frequency: "daily" });
  const family = await habit({ title: "Call family", frequency: "weekly" });

  const checkIns = [];
  const logs = [];

  for (let day = firstDay; day < today; day = addDays(day, 1)) {
    const daysAgo = HISTORY_DAYS - checkIns.length;
    const recent = daysAgo <= 14;

    // Sleep drives everything else, which produces the correlations.
    const sleepHours = Math.round(clamp(5 + random() * 3.5, 4.5, 9) * 2) / 2;
    const rested = (sleepHours - 5) / 3.5; // 0..1
    const mood = clamp(Math.round(1.5 + rested * 3 + (random() - 0.5)), 1, 5);
    const energy = clamp(Math.round(1.5 + rested * 3 + (random() - 0.5) * 1.5), 1, 5);
    // Stress creeps up over the last two weeks.
    const stressBase = recent ? 2 + (14 - daysAgo) * 0.18 : 2.2;
    const stressLevel = clamp(Math.round(stressBase - rested + random()), 1, 5);

    // ~1 in 7 days skipped, so the check-in history has gaps.
    if (random() > 0.14) {
      checkIns.push({
        userId: user.id,
        checkInDate: toDbDate(day),
        mood,
        energy,
        sleepHours,
        stressLevel,
      });
    } else {
      checkIns.push(null);
    }

    const add = (h, done) =>
      done && logs.push({ habitId: h.id, logDate: toDbDate(day), completed: true });
    add(read, random() < 0.25 + rested * 0.7);
    // Gym: strong early on, then the last 3 sessions missed.
    if ([1, 3, 5].includes(dayOfWeek(day))) add(gym, daysAgo > 7 && random() < 0.4 + rested * 0.5);
    // Meditate: patchy, then a solid streak for the last 9 days.
    add(meditate, daysAgo <= 9 || random() < 0.5);
    // Weekly: done once most weeks.
    if (dayOfWeek(day) === 3) add(family, random() < 0.8);
  }

  await prisma.checkIn.createMany({ data: checkIns.filter(Boolean) });
  await prisma.habitLog.createMany({ data: logs });

  console.log(
    `Seeded ${EMAIL} / ${PASSWORD}: 4 habits, ${logs.length} habit logs, ${checkIns.filter(Boolean).length} check-ins over ${HISTORY_DAYS} days (today ${today} left open).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

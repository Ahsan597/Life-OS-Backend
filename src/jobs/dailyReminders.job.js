/**
 * Daily reminder job. Runs every few minutes; each user is handled once per
 * logical day, on the first run after their reminder time (in their own
 * timezone).
 *
 * Safe to run twice or on several servers at once: the notification's
 * dedupeKey ("daily_reminder:<date>") is unique, and only the run that
 * actually inserted it sends the email.
 */
const logger = require("../config/logger");
const userRepository = require("../repositories/user.repository");
const checkInRepository = require("../repositories/checkIn.repository");
const notificationRepository = require("../repositories/notification.repository");
const { loadHabitContext } = require("../services/analyticsContext.service");
const { forecastHabits } = require("../services/prediction.service");
const { buildDailyReminder } = require("../services/reminderContent");
const mailer = require("../services/mailer");
const {
  resolveLogicalDate,
  resolveLocalTime,
  toDbDate,
  fromDbDate,
} = require("../utils/dateUtils");

const BATCH_SIZE = 100;

async function sendEmail(user, notification) {
  try {
    await mailer.send({
      to: user.email,
      subject: notification.title,
      text: `${user.name ? `Hi ${user.name},\n\n` : ""}${notification.message}\n\nOpen Life OS to log it.`,
    });
    await notificationRepository.markSent(notification.id);
    return true;
  } catch (err) {
    // The in-app notification still exists; a failed email shouldn't undo it.
    logger.error({ err, userId: user.id.toString() }, "Reminder email failed");
    return false;
  }
}

/** @returns {"not_due"|"done"|"nothing_open"|"notified"|"emailed"} */
async function remindUser(user, now) {
  const today = resolveLogicalDate(now, user.timezone);
  if (user.lastReminderOn && fromDbDate(user.lastReminderOn) === today) return "done";
  if (resolveLocalTime(now, user.timezone) < user.reminderTime) return "not_due";

  const habits = await loadHabitContext(user.id, user.timezone);
  const [checkIn, streakRisks] = await Promise.all([
    checkInRepository.findByUserAndDate(user.id, toDbDate(today)),
    forecastHabits(user.id, habits, today),
  ]);
  const content = buildDailyReminder({
    today,
    habits,
    checkedInToday: Boolean(checkIn),
    streakRisks,
  });

  let outcome = "nothing_open";
  if (content) {
    const notification = await notificationRepository.createIfNew({
      userId: user.id,
      type: "reminder",
      dedupeKey: `daily_reminder:${today}`,
      scheduledAt: now,
      ...content,
    });
    if (notification) {
      outcome =
        user.emailReminders && (await sendEmail(user, notification)) ? "emailed" : "notified";
    }
  }

  await userRepository.update(user.id, { lastReminderOn: toDbDate(today) });
  return outcome;
}

/**
 * One pass over every user with reminders on.
 * @param {{now?: Date}} options `now` is injectable for tests
 * @returns per-outcome counts, for the job log
 */
async function runDailyReminders({ now = new Date() } = {}) {
  const counts = { users: 0, notified: 0, emailed: 0, failed: 0 };
  let afterId = 0n;

  for (;;) {
    const users = await userRepository.findReminderBatch({ afterId, take: BATCH_SIZE });
    if (users.length === 0) break;
    afterId = users[users.length - 1].id;

    for (const user of users) {
      counts.users += 1;
      try {
        const outcome = await remindUser(user, now);
        if (outcome === "notified") counts.notified += 1;
        if (outcome === "emailed") {
          counts.notified += 1;
          counts.emailed += 1;
        }
      } catch (err) {
        // One user's bad data must not stop everyone else's reminders.
        counts.failed += 1;
        logger.error({ err, userId: user.id.toString() }, "Daily reminder failed");
      }
    }
  }
  return counts;
}

module.exports = { runDailyReminders };

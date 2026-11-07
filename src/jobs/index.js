const notificationRepository = require("../repositories/notification.repository");
const { runDailyReminders } = require("./dailyReminders.job");

const MINUTE = 60_000;
// Read notifications older than this are just clutter.
const NOTIFICATION_RETENTION_DAYS = 90;

async function cleanupNotifications({ now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * MINUTE);
  const { count } = await notificationRepository.deleteCreatedBefore(cutoff);
  return { deleted: count };
}

// Reminders are checked every 5 minutes, so one lands within 5 minutes of
// the user's chosen time.
const jobs = [
  { name: "daily-reminders", intervalMs: 5 * MINUTE, run: () => runDailyReminders() },
  { name: "notification-cleanup", intervalMs: 6 * 60 * MINUTE, run: () => cleanupNotifications() },
];

module.exports = { jobs, cleanupNotifications };

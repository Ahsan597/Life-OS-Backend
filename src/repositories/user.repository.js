const prisma = require("../config/prisma");

function findByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

function findById(id) {
  return prisma.user.findUnique({ where: { id } });
}

function create(data) {
  return prisma.user.create({ data });
}

function update(id, data) {
  return prisma.user.update({ where: { id }, data });
}

/**
 * One page of users with reminders on, in id order (keyset pagination, so
 * the job never holds every user in memory at once).
 */
function findReminderBatch({ afterId = 0n, take }) {
  return prisma.user.findMany({
    where: { remindersEnabled: true, id: { gt: afterId } },
    select: {
      id: true,
      email: true,
      name: true,
      timezone: true,
      reminderTime: true,
      emailReminders: true,
      lastReminderOn: true,
    },
    orderBy: { id: "asc" },
    take,
  });
}

module.exports = { findByEmail, findById, create, update, findReminderBatch };

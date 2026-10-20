const prisma = require("../config/prisma");

function findByHabitAndDate(habitId, logDate) {
  return prisma.habitLog.findUnique({ where: { habitId_logDate: { habitId, logDate } } });
}

function upsert({ habitId, logDate, completed, note }) {
  return prisma.habitLog.upsert({
    where: { habitId_logDate: { habitId, logDate } },
    create: { habitId, logDate, completed, note },
    update: { completed, ...(note !== undefined && { note }) },
  });
}

// `from`/`to` are optional Date bounds (inclusive).
function findManyByHabit(habitId, { from, to } = {}) {
  return prisma.habitLog.findMany({
    where: {
      habitId,
      ...((from || to) && { logDate: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
    },
    orderBy: { logDate: "asc" },
  });
}

// Only the columns streak math needs, for many habits in one query.
function findCompletedByHabitIds(habitIds) {
  return prisma.habitLog.findMany({
    where: { habitId: { in: habitIds }, completed: true },
    select: { habitId: true, logDate: true },
  });
}

// Includes the parent habit so the caller can check ownership.
function findByIdWithHabit(id) {
  return prisma.habitLog.findUnique({ where: { id }, include: { habit: true } });
}

function update(id, data) {
  return prisma.habitLog.update({ where: { id }, data });
}

module.exports = {
  findByHabitAndDate,
  upsert,
  findManyByHabit,
  findCompletedByHabitIds,
  findByIdWithHabit,
  update,
};

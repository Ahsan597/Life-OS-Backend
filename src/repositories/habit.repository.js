const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");

// Prisma needs DbNull (not plain null) to store SQL NULL in a JSON column.
function toDbData(data) {
  return data.targetDays === null ? { ...data, targetDays: Prisma.DbNull } : data;
}

function create(data) {
  return prisma.habit.create({ data: toDbData(data) });
}

function findManyByUser(userId, { includeArchived }) {
  return prisma.habit.findMany({
    where: { userId, ...(includeArchived ? {} : { isActive: true }) },
    orderBy: { createdAt: "asc" },
  });
}

// Scoped by user so one user can never read another user's habit by id.
function findByIdForUser(id, userId) {
  return prisma.habit.findFirst({ where: { id, userId } });
}

function update(id, data) {
  return prisma.habit.update({ where: { id }, data: toDbData(data) });
}

module.exports = { create, findManyByUser, findByIdForUser, update };

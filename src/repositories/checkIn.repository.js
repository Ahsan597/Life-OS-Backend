const prisma = require("../config/prisma");

function findByUserAndDate(userId, checkInDate) {
  return prisma.checkIn.findUnique({ where: { userId_checkInDate: { userId, checkInDate } } });
}

function upsert(userId, checkInDate, data) {
  return prisma.checkIn.upsert({
    where: { userId_checkInDate: { userId, checkInDate } },
    create: { userId, checkInDate, ...data },
    update: data,
  });
}

// Inclusive Date bounds.
function findManyInRange(userId, from, to) {
  return prisma.checkIn.findMany({
    where: { userId, checkInDate: { gte: from, lte: to } },
    orderBy: { checkInDate: "asc" },
  });
}

module.exports = { findByUserAndDate, upsert, findManyInRange };

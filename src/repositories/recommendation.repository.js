const prisma = require("../config/prisma");

const withHabitTitle = { habit: { select: { title: true } } };

// Inserts new candidates; ones already stored (same user + dedupeKey) are
// left untouched, so an earlier accept/dismiss is never overwritten.
function createManyIgnoringExisting(rows) {
  if (rows.length === 0) return Promise.resolve({ count: 0 });
  return prisma.recommendation.createMany({ data: rows, skipDuplicates: true });
}

// A still-pending recommendation's wording can change while its situation
// lasts (e.g. "missed 3 times" -> "missed 4 times"); keep it current.
// Accepted/dismissed rows are left as the user saw them.
function refreshPendingText(userId, candidates) {
  return prisma.$transaction(
    candidates.map(({ dedupeKey, message, reason }) =>
      prisma.recommendation.updateMany({
        // Only rows whose text actually changed, so updatedAt stays meaningful.
        where: {
          userId,
          dedupeKey,
          status: "pending",
          OR: [{ message: { not: message } }, { reason: { not: reason } }],
        },
        data: { message, reason },
      })
    )
  );
}

// Pending recommendations whose rule no longer fires are stale: drop them.
function deleteStalePending(userId, activeDedupeKeys) {
  return prisma.recommendation.deleteMany({
    where: { userId, status: "pending", dedupeKey: { notIn: activeDedupeKeys } },
  });
}

// `status` undefined means every status.
function findManyByUser(userId, { status } = {}) {
  return prisma.recommendation.findMany({
    where: { userId, ...(status && { status }) },
    include: withHabitTitle,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

// Scoped by user so one user can never touch another user's recommendation.
function findByIdForUser(id, userId) {
  return prisma.recommendation.findFirst({ where: { id, userId } });
}

function updateStatus(id, status) {
  return prisma.recommendation.update({
    where: { id },
    data: { status },
    include: withHabitTitle,
  });
}

module.exports = {
  createManyIgnoringExisting,
  refreshPendingText,
  deleteStalePending,
  findManyByUser,
  findByIdForUser,
  updateStatus,
};

const prisma = require("../config/prisma");

/**
 * Inserts one notification unless the user already has one with the same
 * dedupeKey. Returns the new row, or null if it already existed - so when two
 * job runs race, exactly one of them gets the row and delivers it.
 */
async function createIfNew(data) {
  const { count } = await prisma.notification.createMany({ data: [data], skipDuplicates: true });
  if (count === 0) return null;
  return prisma.notification.findUnique({
    where: { userId_dedupeKey: { userId: data.userId, dedupeKey: data.dedupeKey } },
  });
}

// Newest first; `beforeId` is the cursor (the last id of the previous page).
function findPage(userId, { unreadOnly, beforeId, take }) {
  return prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly && { isRead: false }),
      ...(beforeId && { id: { lt: beforeId } }),
    },
    orderBy: { id: "desc" },
    take,
  });
}

function countUnread(userId) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

// Scoped by user so one user can never touch another user's notification.
function findByIdForUser(id, userId) {
  return prisma.notification.findFirst({ where: { id, userId } });
}

function setRead(id, isRead) {
  return prisma.notification.update({
    where: { id },
    data: { isRead, readAt: isRead ? new Date() : null },
  });
}

function markAllRead(userId) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

function markSent(id) {
  return prisma.notification.update({ where: { id }, data: { sentAt: new Date() } });
}

function deleteCreatedBefore(date) {
  return prisma.notification.deleteMany({ where: { createdAt: { lt: date } } });
}

module.exports = {
  createIfNew,
  findPage,
  countUnread,
  findByIdForUser,
  setRead,
  markAllRead,
  markSent,
  deleteCreatedBefore,
};

const notificationRepository = require("../repositories/notification.repository");
const AppError = require("../utils/AppError");

function toPublicNotification(n) {
  return {
    id: n.id.toString(),
    type: n.type,
    title: n.title,
    message: n.message,
    data: n.data,
    isRead: n.isRead,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

/** One page, newest first, plus the cursor for the next page (null = no more). */
async function listNotifications(userId, { unreadOnly, before, limit }) {
  const [rows, unreadCount] = await Promise.all([
    // One extra row tells whether another page exists.
    notificationRepository.findPage(userId, { unreadOnly, beforeId: before, take: limit + 1 }),
    notificationRepository.countUnread(userId),
  ]);
  const page = rows.slice(0, limit);
  return {
    notifications: page.map(toPublicNotification),
    unreadCount,
    nextCursor: rows.length > limit ? page[page.length - 1].id.toString() : null,
  };
}

async function setRead(userId, id, isRead) {
  const notification = await notificationRepository.findByIdForUser(id, userId);
  if (!notification) {
    throw new AppError("Notification not found", 404);
  }
  return toPublicNotification(await notificationRepository.setRead(notification.id, isRead));
}

async function markAllRead(userId) {
  const { count } = await notificationRepository.markAllRead(userId);
  return { updated: count };
}

module.exports = { listNotifications, setRead, markAllRead };

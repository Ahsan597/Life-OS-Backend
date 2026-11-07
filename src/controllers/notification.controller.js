const notificationService = require("../services/notification.service");

async function list(req, res) {
  const result = await notificationService.listNotifications(req.user.id, req.query);
  res.status(200).json(result);
}

async function update(req, res) {
  const notification = await notificationService.setRead(
    req.user.id,
    req.params.id,
    req.body.isRead
  );
  res.status(200).json({ notification });
}

async function readAll(req, res) {
  const result = await notificationService.markAllRead(req.user.id);
  res.status(200).json(result);
}

module.exports = { list, update, readAll };

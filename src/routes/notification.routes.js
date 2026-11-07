const express = require("express");
const notificationController = require("../controllers/notification.controller");
const validateRequest = require("../middlewares/validateRequest");
const authGuard = require("../middlewares/authGuard");
const { idParamsSchema } = require("../validators/common.validators");
const {
  listNotificationsQuerySchema,
  updateNotificationSchema,
} = require("../validators/notification.validators");

const router = express.Router();

router.use(authGuard);

router.get(
  "/",
  validateRequest(listNotificationsQuerySchema, "query"),
  notificationController.list
);
router.post("/read-all", notificationController.readAll);
router.patch(
  "/:id",
  validateRequest(idParamsSchema, "params"),
  validateRequest(updateNotificationSchema),
  notificationController.update
);

module.exports = router;

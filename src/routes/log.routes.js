const express = require("express");
const habitController = require("../controllers/habit.controller");
const validateRequest = require("../middlewares/validateRequest");
const authGuard = require("../middlewares/authGuard");
const { idParamsSchema } = require("../validators/common.validators");
const { updateLogSchema } = require("../validators/habit.validators");

const router = express.Router();

router.use(authGuard);

router.patch(
  "/:id",
  validateRequest(idParamsSchema, "params"),
  validateRequest(updateLogSchema),
  habitController.updateLog
);

module.exports = router;

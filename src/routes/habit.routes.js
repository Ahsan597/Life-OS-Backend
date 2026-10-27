const express = require("express");
const habitController = require("../controllers/habit.controller");
const validateRequest = require("../middlewares/validateRequest");
const authGuard = require("../middlewares/authGuard");
const { idParamsSchema, dateRangeQuerySchema } = require("../validators/common.validators");
const {
  createHabitSchema,
  updateHabitSchema,
  listHabitsQuerySchema,
  createLogSchema,
} = require("../validators/habit.validators");

const router = express.Router();
const validId = validateRequest(idParamsSchema, "params");

router.use(authGuard);

router.post("/", validateRequest(createHabitSchema), habitController.create);
router.get("/", validateRequest(listHabitsQuerySchema, "query"), habitController.list);
router.get("/:id", validId, habitController.getById);
router.put("/:id", validId, validateRequest(updateHabitSchema), habitController.update);
router.delete("/:id", validId, habitController.remove);

router.post("/:id/logs", validId, validateRequest(createLogSchema), habitController.createLog);
router.get(
  "/:id/logs",
  validId,
  validateRequest(dateRangeQuerySchema, "query"),
  habitController.listLogs
);
router.get(
  "/:id/stats",
  validId,
  validateRequest(dateRangeQuerySchema, "query"),
  habitController.stats
);

module.exports = router;

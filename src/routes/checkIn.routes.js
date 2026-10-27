const express = require("express");
const checkInController = require("../controllers/checkIn.controller");
const validateRequest = require("../middlewares/validateRequest");
const authGuard = require("../middlewares/authGuard");
const { dateParamsSchema, dateRangeQuerySchema } = require("../validators/common.validators");
const { createCheckInSchema } = require("../validators/checkIn.validators");

const router = express.Router();
const validRange = validateRequest(dateRangeQuerySchema, "query");

router.use(authGuard);

router.post("/", validateRequest(createCheckInSchema), checkInController.save);
router.get("/", validRange, checkInController.list);
// Must be registered before "/:date" so "stats" isn't treated as a date.
router.get("/stats", validRange, checkInController.stats);
router.get("/:date", validateRequest(dateParamsSchema, "params"), checkInController.getByDate);

module.exports = router;

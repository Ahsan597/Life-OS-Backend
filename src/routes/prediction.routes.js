const express = require("express");
const predictionController = require("../controllers/prediction.controller");
const validateRequest = require("../middlewares/validateRequest");
const authGuard = require("../middlewares/authGuard");
const { dateRangeQuerySchema } = require("../validators/common.validators");

const router = express.Router();

router.use(authGuard);

router.get("/streak-risk", predictionController.streakRisk);
router.get(
  "/accuracy",
  validateRequest(dateRangeQuerySchema, "query"),
  predictionController.accuracy
);

module.exports = router;

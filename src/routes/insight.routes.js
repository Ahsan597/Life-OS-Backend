const express = require("express");
const insightController = require("../controllers/insight.controller");
const validateRequest = require("../middlewares/validateRequest");
const authGuard = require("../middlewares/authGuard");
const { idParamsSchema, dateRangeQuerySchema } = require("../validators/common.validators");
const {
  listRecommendationsQuerySchema,
  updateRecommendationSchema,
} = require("../validators/insight.validators");

const router = express.Router();

router.use(authGuard);

router.get(
  "/correlations",
  validateRequest(dateRangeQuerySchema, "query"),
  insightController.correlations
);
router.get(
  "/recommendations",
  validateRequest(listRecommendationsQuerySchema, "query"),
  insightController.recommendations
);
router.patch(
  "/recommendations/:id",
  validateRequest(idParamsSchema, "params"),
  validateRequest(updateRecommendationSchema),
  insightController.updateRecommendation
);

module.exports = router;

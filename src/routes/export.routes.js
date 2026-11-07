const express = require("express");
const exportController = require("../controllers/export.controller");
const validateRequest = require("../middlewares/validateRequest");
const authGuard = require("../middlewares/authGuard");
const { exportLimiter } = require("../middlewares/rateLimiter");
const { exportQuerySchema } = require("../validators/export.validators");

const router = express.Router();

router.get(
  "/",
  authGuard,
  exportLimiter,
  validateRequest(exportQuerySchema, "query"),
  exportController.download
);

module.exports = router;

const express = require("express");
const healthRoutes = require("./health.routes");
const authRoutes = require("./auth.routes");
const habitRoutes = require("./habit.routes");
const logRoutes = require("./log.routes");
const checkInRoutes = require("./checkIn.routes");
const insightRoutes = require("./insight.routes");
const predictionRoutes = require("./prediction.routes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/habits", habitRoutes);
router.use("/logs", logRoutes);
router.use("/checkins", checkInRoutes);
router.use("/insights", insightRoutes);
router.use("/predictions", predictionRoutes);

module.exports = router;

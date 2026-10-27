const predictionService = require("../services/prediction.service");

async function streakRisk(req, res) {
  const result = await predictionService.getStreakRisk(req.user.id);
  res.status(200).json(result);
}

async function accuracy(req, res) {
  const result = await predictionService.getAccuracy(req.user.id, req.query);
  res.status(200).json(result);
}

module.exports = { streakRisk, accuracy };

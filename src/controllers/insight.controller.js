const insightService = require("../services/insight.service");

async function correlations(req, res) {
  const result = await insightService.getCorrelations(req.user.id, req.query);
  res.status(200).json(result);
}

async function recommendations(req, res) {
  const recommendations = await insightService.getRecommendations(req.user.id, req.query);
  res.status(200).json({ recommendations });
}

async function updateRecommendation(req, res) {
  const recommendation = await insightService.updateRecommendationStatus(
    req.user.id,
    req.params.id,
    req.body.status
  );
  res.status(200).json({ recommendation });
}

module.exports = { correlations, recommendations, updateRecommendation };

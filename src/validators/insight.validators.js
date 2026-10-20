const { z } = require("zod");

const listRecommendationsQuerySchema = z.object({
  status: z.enum(["pending", "accepted", "dismissed", "all"]).default("pending"),
});

// Users act on a recommendation; "pending" is only ever set by the engine.
const updateRecommendationSchema = z.object({
  status: z.enum(["accepted", "dismissed"]),
});

module.exports = { listRecommendationsQuerySchema, updateRecommendationSchema };

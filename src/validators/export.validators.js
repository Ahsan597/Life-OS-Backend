const { z } = require("zod");

const exportQuerySchema = z
  .object({
    format: z.enum(["json", "csv"]).default("json"),
    // CSV is one table per file, so it needs to know which one.
    dataset: z.enum(["habits", "habit_logs", "check_ins", "recommendations"]).optional(),
  })
  .refine((q) => q.format !== "csv" || q.dataset, {
    message: "dataset is required for CSV (habits, habit_logs, check_ins or recommendations)",
    path: ["dataset"],
  });

module.exports = { exportQuerySchema };

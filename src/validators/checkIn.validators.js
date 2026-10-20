const { z } = require("zod");
const { dateString } = require("./common.validators");

const scale = z.number().int().min(1).max(5).nullable().optional();

const METRICS = ["mood", "energy", "sleepHours", "stressLevel"];

const createCheckInSchema = z
  .object({
    // Defaults to "today" in the user's timezone (resolved in the service).
    date: dateString.optional(),
    mood: scale,
    energy: scale,
    // DECIMAL(4,1): one decimal place, 0-24 hours.
    sleepHours: z
      .number()
      .min(0)
      .max(24)
      .transform((h) => Math.round(h * 10) / 10)
      .nullable()
      .optional(),
    stressLevel: scale,
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((body) => METRICS.some((m) => body[m] != null), {
    message: "Provide at least one of: mood, energy, sleepHours, stressLevel",
  });

module.exports = { METRICS, createCheckInSchema };

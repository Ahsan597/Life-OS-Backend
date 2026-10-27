const { z } = require("zod");
const { dateString } = require("./common.validators");

// 0 = Sunday ... 6 = Saturday. Deduplicated and sorted so stored values are canonical.
const targetDaysField = z
  .array(z.number().int().min(0).max(6))
  .min(1, "Pick at least one day")
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

const habitFields = {
  title: z.string().trim().min(1, "Title is required").max(150),
  description: z.string().trim().max(2000).nullable(),
  frequency: z.enum(["daily", "weekly", "custom"]),
  targetDays: targetDaysField.nullable(),
  isActive: z.boolean(),
};

// Cross-field rule: only "custom" habits have target days. Returns
// validation details in the same shape validateRequest produces. Shared by
// create and update; update applies it to the merged (existing + patch) habit.
function scheduleIssues({ frequency, targetDays }) {
  if (frequency === "custom" && !targetDays) {
    return [{ field: "targetDays", message: "targetDays is required when frequency is 'custom'" }];
  }
  if (frequency !== "custom" && targetDays) {
    return [
      { field: "targetDays", message: "targetDays is only allowed when frequency is 'custom'" },
    ];
  }
  return [];
}

const createHabitSchema = z
  .object({
    title: habitFields.title,
    description: habitFields.description.optional(),
    frequency: habitFields.frequency.default("daily"),
    targetDays: habitFields.targetDays.optional(),
  })
  .superRefine((habit, ctx) => {
    for (const { field, message } of scheduleIssues(habit)) {
      ctx.addIssue({ code: "custom", path: [field], message });
    }
  });

// Partial update: any subset of fields, but at least one.
const updateHabitSchema = z
  .object({
    title: habitFields.title.optional(),
    description: habitFields.description.optional(),
    frequency: habitFields.frequency.optional(),
    targetDays: habitFields.targetDays.optional(),
    isActive: habitFields.isActive.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

const listHabitsQuerySchema = z.object({
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const createLogSchema = z.object({
  // Defaults to "today" in the user's timezone (resolved in the service).
  date: dateString.optional(),
  completed: z.boolean().default(true),
  note: z.string().trim().max(2000).nullable().optional(),
});

const updateLogSchema = z
  .object({
    completed: z.boolean().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

module.exports = {
  scheduleIssues,
  createHabitSchema,
  updateHabitSchema,
  listHabitsQuerySchema,
  createLogSchema,
  updateLogSchema,
};

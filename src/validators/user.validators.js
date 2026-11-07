const { z } = require("zod");
const { text, timezone } = require("./common.validators");

// 24-hour "HH:MM" in the user's own timezone.
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be a time as HH:MM (24h)");

const preferencesSchema = z.object({
  remindersEnabled: z.boolean().optional(),
  reminderTime: timeOfDay.optional(),
  emailReminders: z.boolean().optional(),
});

const updateProfileSchema = z
  .object({
    name: text({ min: 1, max: 100 }).nullable().optional(),
    timezone: timezone.optional(),
    preferences: preferencesSchema.optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.timezone !== undefined ||
      Object.keys(body.preferences || {}).length > 0,
    "Provide at least one field to update"
  );

module.exports = { updateProfileSchema };

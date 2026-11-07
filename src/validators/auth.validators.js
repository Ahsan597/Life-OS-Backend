const { z } = require("zod");
const { text, timezone } = require("./common.validators");

// Normalize first, then validate: z.email() checks the format before any
// .trim() chained onto it would run.
const emailField = z.string().trim().toLowerCase().pipe(z.email().max(255));

const registerSchema = z.object({
  email: emailField,
  // bcrypt only uses the first 72 bytes of a password
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  name: text({ min: 1, max: 100 }).optional(),
  timezone: timezone.optional(),
});

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

module.exports = { registerSchema, loginSchema, refreshTokenSchema };

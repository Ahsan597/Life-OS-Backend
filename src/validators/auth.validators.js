const { z } = require("zod");

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Normalize first, then validate: z.email() checks the format before any
// .trim() chained onto it would run.
const emailField = z.string().trim().toLowerCase().pipe(z.email().max(255));

const registerSchema = z.object({
  email: emailField,
  // bcrypt only uses the first 72 bytes of a password
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  name: z.string().trim().min(1).max(100).optional(),
  timezone: z
    .string()
    .max(50)
    .refine(isValidTimezone, "Invalid IANA timezone (e.g. 'Asia/Karachi')")
    .optional(),
});

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

module.exports = { registerSchema, loginSchema, refreshTokenSchema };

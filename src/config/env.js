require("dotenv").config({ quiet: true });
const { z } = require("zod");

const booleanFlag = z.enum(["true", "false"]).transform((v) => v === "true");

// Validate all configuration once at startup, so a missing or malformed
// variable fails fast with a clear message instead of on the first request.
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().startsWith("mysql://", "DATABASE_URL must be a mysql:// URL"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  // Comma-separated list of allowed browser origins, e.g. "http://localhost:5173".
  CORS_ORIGIN: z.string().optional(),
  // Number of reverse proxies in front of the app (0 = none). Needed for the
  // real client IP, which rate limiting keys on. Never trust more than exist.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_ENABLED: booleanFlag.default(true),
  // Background jobs (reminders, cleanup). Off for tests and one-off scripts.
  SCHEDULER_ENABLED: booleanFlag.default(true),
  // "log" is a placeholder that writes emails to the log; see services/mailer.js.
  MAIL_TRANSPORT: z.enum(["log"]).default("log"),
  MAIL_FROM: z.string().default("Life OS <no-reply@lifeos.local>"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
}

const vars = parsed.data;

if (vars.JWT_ACCESS_SECRET === vars.JWT_REFRESH_SECRET) {
  throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different");
}
if (vars.NODE_ENV === "production" && !vars.CORS_ORIGIN) {
  throw new Error("CORS_ORIGIN must be set in production");
}

const env = {
  port: vars.PORT,
  nodeEnv: vars.NODE_ENV,
  databaseUrl: vars.DATABASE_URL,
  jwt: {
    accessSecret: vars.JWT_ACCESS_SECRET,
    refreshSecret: vars.JWT_REFRESH_SECRET,
    accessExpiresIn: vars.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: vars.JWT_REFRESH_EXPIRES_IN,
  },
  // `true` reflects any origin; only allowed outside production (checked above).
  corsOrigin: vars.CORS_ORIGIN ? vars.CORS_ORIGIN.split(",").map((o) => o.trim()) : true,
  trustProxy: vars.TRUST_PROXY,
  rateLimitEnabled: vars.RATE_LIMIT_ENABLED,
  schedulerEnabled: vars.SCHEDULER_ENABLED,
  mail: { transport: vars.MAIL_TRANSPORT, from: vars.MAIL_FROM },
};

module.exports = env;

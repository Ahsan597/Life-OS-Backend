require("dotenv").config({ quiet: true });
const { z } = require("zod");

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
};

module.exports = env;

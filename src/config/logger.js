const pino = require("pino");
const env = require("./env");

const logger = pino({
  level: env.nodeEnv === "test" ? "silent" : "info",
  // Never write credentials to logs: request logs include headers by default.
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
    censor: "[REDACTED]",
  },
  transport:
    env.nodeEnv === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

module.exports = logger;

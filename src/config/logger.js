const pino = require("pino");
const env = require("./env");

const logger = pino({
  level: env.nodeEnv === "test" ? "silent" : "info",
  transport:
    env.nodeEnv === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

module.exports = logger;

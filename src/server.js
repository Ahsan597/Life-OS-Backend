const app = require("./app");
const env = require("./config/env");
const logger = require("./config/logger");
const prisma = require("./config/prisma");

const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = app.listen(env.port, () => {
  logger.info(`Server running on port ${env.port} [${env.nodeEnv}]`);
});

// Stop accepting connections, let in-flight requests finish, then release
// the DB pool. Force-exit if that takes too long (e.g. a hung keep-alive).
function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  shutdown("unhandledRejection");
});

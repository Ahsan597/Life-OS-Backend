const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const pinoHttp = require("pino-http");

const env = require("./config/env");
const logger = require("./config/logger");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/errorHandler");
const { apiLimiter } = require("./middlewares/rateLimiter");

const app = express();

// Only trust X-Forwarded-For from proxies we actually run behind.
app.set("trust proxy", env.trustProxy);

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    // Readable by the frontend: the export filename and when to retry after a 429.
    exposedHeaders: ["Content-Disposition", "Retry-After"],
  })
);
app.use(express.json({ limit: "100kb" }));
app.use(pinoHttp({ logger, autoLogging: env.nodeEnv !== "test" }));

// Responses hold personal data: never let browsers or proxies cache them.
function noStore(req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

app.use("/api/v1", apiLimiter, noStore, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

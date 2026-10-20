const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const pinoHttp = require("pino-http");

const env = require("./config/env");
const logger = require("./config/logger");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/errorHandler");

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: "100kb" }));
app.use(pinoHttp({ logger, autoLogging: env.nodeEnv !== "test" }));

app.use("/api/v1", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

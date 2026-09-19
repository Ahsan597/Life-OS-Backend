const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const pinoHttp = require("pino-http");

const logger = require("./config/logger");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/errorHandler");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger, autoLogging: process.env.NODE_ENV !== "test" }));

app.use("/api/v1", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

const logger = require("../config/logger");

function notFound(req, res, next) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  if (!err.isOperational) {
    logger.error({ err }, "Unexpected error");
  }

  res.status(statusCode).json({
    error: err.isOperational ? err.message : "Internal server error",
  });
}

module.exports = { notFound, errorHandler };

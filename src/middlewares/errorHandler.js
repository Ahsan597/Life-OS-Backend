const { Prisma } = require("@prisma/client");
const logger = require("../config/logger");
const AppError = require("../utils/AppError");

// Known Prisma errors that are the client's fault, not a server bug.
const PRISMA_ERRORS = {
  // Unique constraint, e.g. two concurrent registrations with the same email.
  P2002: () => new AppError("Resource already exists", 409),
  // Record to update/delete no longer exists.
  P2025: () => new AppError("Resource not found", 404),
};

/**
 * Converts errors thrown by libraries into AppErrors so they get the right
 * status and a safe message. Anything left unconverted is a real bug.
 */
function normalize(err) {
  if (err instanceof AppError) return err;

  if (err instanceof Prisma.PrismaClientKnownRequestError && PRISMA_ERRORS[err.code]) {
    return PRISMA_ERRORS[err.code]();
  }

  // body-parser (express.json) errors: malformed JSON, payload too large, etc.
  // `expose` marks messages that are safe to show the client.
  if (err.expose && err.status >= 400 && err.status < 500) {
    const message = err.type === "entity.parse.failed" ? "Malformed JSON body" : err.message;
    return new AppError(message, err.status);
  }

  return err;
}

function notFound(req, res, next) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  const error = normalize(err);

  if (!error.isOperational) {
    logger.error({ err }, "Unexpected error");
    return res.status(500).json({ error: "Internal server error" });
  }

  const body = { error: error.message };
  if (error.details) {
    body.details = error.details;
  }
  res.status(error.statusCode).json(body);
}

module.exports = { notFound, errorHandler };

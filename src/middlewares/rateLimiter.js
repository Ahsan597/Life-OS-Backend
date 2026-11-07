/**
 * Rate limiting (express-rate-limit). Limited requests get a 429 through the
 * normal error handler, so the body is the usual `{ error }`, plus the
 * standard `RateLimit` / `RateLimit-Policy` / `Retry-After` headers.
 *
 * The store is in-memory, i.e. per process. Behind several instances, plug in
 * a shared store (e.g. rate-limit-redis) so the limits are global.
 */
const { rateLimit } = require("express-rate-limit");
const env = require("../config/env");
const AppError = require("../utils/AppError");

const MINUTE = 60_000;

/**
 * @param {object} options express-rate-limit options plus `message`
 *        (the 429 error text) and `enabled` (defaults to RATE_LIMIT_ENABLED)
 */
function createRateLimiter({ message, enabled = env.rateLimitEnabled, ...options }) {
  if (!enabled) return (req, res, next) => next();
  return rateLimit({
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res, next, opts) => next(new AppError(message, opts.statusCode)),
    ...options,
  });
}

// Every API request, per client IP. Health checks are exempt so load
// balancer probes can never be throttled.
const apiLimiter = createRateLimiter({
  windowMs: 15 * MINUTE,
  limit: 300,
  skip: (req) => req.path === "/health",
  message: "Too many requests, please slow down",
});

// Login/register, per IP. Only failed attempts count, so it stops password
// guessing without ever locking out a user who types their password right.
const authLimiter = createRateLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many failed attempts, please try again later",
});

// Exports read everything the user has; per user, since it's behind auth.
const exportLimiter = createRateLimiter({
  windowMs: 60 * MINUTE,
  limit: 10,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: "Export limit reached, please try again later",
});

module.exports = { createRateLimiter, apiLimiter, authLimiter, exportLimiter };

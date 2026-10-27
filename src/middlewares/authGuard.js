const tokenService = require("../services/token.service");
const AppError = require("../utils/AppError");

/**
 * Requires a valid access token in the `Authorization: Bearer <token>` header.
 * On success, attaches `req.user = { id }` (id is a BigInt, matching Prisma).
 */
function authGuard(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new AppError("Authentication required", 401));
  }

  try {
    const payload = tokenService.verifyAccessToken(token);
    req.user = { id: BigInt(payload.sub) };
    next();
  } catch {
    next(new AppError("Invalid or expired access token", 401));
  }
}

module.exports = authGuard;

const AppError = require("../utils/AppError");

/**
 * Validates req.body against a Zod schema. On success, req.body is replaced
 * with the parsed (trimmed/defaulted/stripped) data so controllers only ever
 * see clean input.
 */
function validateRequest(schema) {
  return function (req, res, next) {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return next(new AppError("Validation failed", 400, details));
    }

    req.body = result.data;
    next();
  };
}

module.exports = validateRequest;

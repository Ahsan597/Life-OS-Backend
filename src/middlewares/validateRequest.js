const AppError = require("../utils/AppError");

/**
 * Validates req[source] ("body", "query" or "params") against a Zod schema.
 * On success, req[source] is replaced with the parsed (trimmed/defaulted/
 * stripped) data so controllers only ever see clean input.
 */
function validateRequest(schema, source = "body") {
  return function (req, res, next) {
    const result = schema.safeParse(req[source] ?? {});

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return next(new AppError("Validation failed", 400, details));
    }

    // Express 5 exposes req.query as a getter only, so plain assignment
    // would not stick; defineProperty works for every source.
    Object.defineProperty(req, source, {
      value: result.data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    next();
  };
}

module.exports = validateRequest;

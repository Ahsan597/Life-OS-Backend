const { z } = require("zod");
const { isValidDateString } = require("../utils/dateUtils");

const dateString = z.string().refine(isValidDateString, "Must be a valid date (YYYY-MM-DD)");

// Route ids arrive as strings; Prisma ids are BigInt.
const idParam = z
  .string()
  .regex(/^[1-9]\d{0,18}$/, "Must be a positive integer id")
  .transform(BigInt);

const idParamsSchema = z.object({ id: idParam });

const dateParamsSchema = z.object({ date: dateString });

const dateRangeQuerySchema = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "'from' must be on or before 'to'",
    path: ["from"],
  });

module.exports = { dateString, idParam, idParamsSchema, dateParamsSchema, dateRangeQuerySchema };

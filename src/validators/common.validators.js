const { z } = require("zod");
const { isValidDateString } = require("../utils/dateUtils");

const dateString = z.string().refine(isValidDateString, "Must be a valid date (YYYY-MM-DD)");

// C0 control characters except tab, newline and carriage return. They have no
// place in user text and break CSV exports, logs and some UIs.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * User-entered free text: control characters stripped, Unicode normalized
 * (NFC, so visually identical strings compare equal), then trimmed. Text is
 * stored as typed otherwise; escaping is the job of whatever renders it.
 */
function text({ min = 0, max, message }) {
  return z
    .string()
    .transform((value) => value.replace(CONTROL_CHARS, "").normalize("NFC").trim())
    .pipe(z.string().min(min, message).max(max));
}

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const timezone = z
  .string()
  .max(50)
  .refine(isValidTimezone, "Invalid IANA timezone (e.g. 'Asia/Karachi')");

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

module.exports = {
  dateString,
  text,
  timezone,
  idParam,
  idParamsSchema,
  dateParamsSchema,
  dateRangeQuerySchema,
};

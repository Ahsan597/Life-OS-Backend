/**
 * Day-boundary rule (see database_design.txt principle #2):
 * a "logical date" is a plain calendar day string, YYYY-MM-DD, already
 * resolved in the user's timezone. All day math below works on those strings
 * through UTC so it never shifts with the server's own timezone or DST.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolves the calendar date (YYYY-MM-DD) that `date` falls on, as seen from
 * the given IANA timezone. This is what habit_logs/check_ins should store as
 * their "day".
 */
function resolveLogicalDate(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function getTodayForUser(timezone) {
  return resolveLogicalDate(new Date(), timezone);
}

// True only for real calendar days ("2026-02-30" is rejected).
function isValidDateString(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// Prisma maps @db.Date columns to a Date at UTC midnight.
function toDbDate(dateString) {
  return new Date(`${dateString}T00:00:00Z`);
}

function fromDbDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  return fromDbDate(new Date(toDbDate(dateString).getTime() + days * MS_PER_DAY));
}

// Whole days from `from` to `to` (negative if `to` is earlier).
function diffDays(from, to) {
  return Math.round((toDbDate(to) - toDbDate(from)) / MS_PER_DAY);
}

// 0 = Sunday ... 6 = Saturday, the same convention habits.target_days uses.
function dayOfWeek(dateString) {
  return toDbDate(dateString).getUTCDay();
}

// Monday of the ISO week the date falls in.
function weekStart(dateString) {
  const offset = (dayOfWeek(dateString) + 6) % 7;
  return addDays(dateString, -offset);
}

function minDate(a, b) {
  return a < b ? a : b;
}

function maxDate(a, b) {
  return a > b ? a : b;
}

module.exports = {
  resolveLogicalDate,
  getTodayForUser,
  isValidDateString,
  toDbDate,
  fromDbDate,
  addDays,
  diffDays,
  dayOfWeek,
  weekStart,
  minDate,
  maxDate,
};

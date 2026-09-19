/**
 * Resolves the calendar date (YYYY-MM-DD) that `date` falls on, as seen from
 * the given IANA timezone. This is what habit_logs/check_ins should store as
 * their "day" - see database_design.txt principle #2.
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

module.exports = { resolveLogicalDate, getTodayForUser };

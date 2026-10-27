/**
 * Pure streak + completion-rate math. No DB access: callers pass in the
 * habit's schedule, the set of completed logical dates, and "today" (already
 * resolved in the user's timezone).
 *
 * Everything is built on "periods" - the unit a habit is expected to be done in:
 *   daily  -> every calendar day
 *   custom -> only the days listed in targetDays (0 = Sunday ... 6 = Saturday)
 *   weekly -> every ISO week (Monday-Sunday), done if completed on any day of it
 *
 * The period containing today is still open: if it isn't completed yet it is
 * "pending", which neither breaks a streak nor counts as a miss.
 */
const { addDays, dayOfWeek, weekStart, maxDate } = require("../utils/dateUtils");

/**
 * @param {{frequency: string, targetDays: number[]|null}} habit
 * @param {Set<string>} completedDates YYYY-MM-DD dates with a completed log
 * @param {string} start first day to consider (inclusive)
 * @param {string} end   last day to consider (inclusive, should be <= today)
 * @param {string} today the user's current logical date
 * @returns {{key: string, completed: boolean, pending: boolean}[]} oldest first;
 *          `key` is the day, or the week's Monday for weekly habits
 */
function buildPeriods(habit, completedDates, start, end, today) {
  if (start > end) return [];
  return habit.frequency === "weekly"
    ? buildWeeklyPeriods(completedDates, start, end, today)
    : buildDailyPeriods(habit, completedDates, start, end, today);
}

function buildDailyPeriods(habit, completedDates, start, end, today) {
  const targetDays = habit.frequency === "custom" ? new Set(habit.targetDays || []) : null;
  const periods = [];

  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (targetDays && !targetDays.has(dayOfWeek(day))) continue;
    const completed = completedDates.has(day);
    periods.push({ key: day, completed, pending: !completed && day === today });
  }
  return periods;
}

function buildWeeklyPeriods(completedDates, start, end, today) {
  const currentWeek = weekStart(today);
  const periods = [];

  for (let week = weekStart(start); week <= end; week = addDays(week, 7)) {
    let completed = false;
    for (let i = 0; i < 7 && !completed; i++) {
      completed = completedDates.has(addDays(week, i));
    }
    periods.push({ key: week, completed, pending: !completed && week === currentWeek });
  }
  return periods;
}

function computeStreaks(periods) {
  let longest = 0;
  let run = 0;
  for (const period of periods) {
    if (period.completed) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (!period.pending) {
      run = 0;
    }
  }

  let current = 0;
  for (let i = periods.length - 1; i >= 0; i--) {
    const period = periods[i];
    if (period.pending) continue;
    if (!period.completed) break;
    current += 1;
  }

  return { currentStreak: current, longestStreak: longest };
}

/**
 * The run of periods at the end of the history that all have `completed`
 * equal to the given value. An open (pending) period at the very end is
 * skipped, matching how streaks are counted.
 */
function trailingRun(periods, completed) {
  let end = periods.length - 1;
  if (end >= 0 && periods[end].pending) end -= 1;
  let length = 0;
  let startKey = null;
  for (let i = end; i >= 0 && periods[i].completed === completed; i--) {
    length += 1;
    startKey = periods[i].key;
  }
  return { length, startKey };
}

function rate(completed, scheduled) {
  return scheduled === 0 ? null : Math.round((completed / scheduled) * 1000) / 1000;
}

// Pending periods are left out of the denominator: today isn't a miss yet.
function completionStats(periods) {
  const counted = periods.filter((p) => !p.pending);
  const completed = counted.filter((p) => p.completed).length;
  return { scheduled: counted.length, completed, completionRate: rate(completed, counted.length) };
}

// Per-week breakdown for "completion rate over time" charts.
function weeklyBreakdown(periods) {
  const weeks = new Map();
  for (const period of periods) {
    if (period.pending) continue;
    const key = weekStart(period.key);
    const week = weeks.get(key) || { weekStart: key, scheduled: 0, completed: 0 };
    week.scheduled += 1;
    if (period.completed) week.completed += 1;
    weeks.set(key, week);
  }
  return [...weeks.values()].map((w) => ({ ...w, rate: rate(w.completed, w.scheduled) }));
}

/**
 * The first day a habit's history should be measured from: the day it was
 * created, or earlier if the user backfilled logs before that.
 */
function habitStartDate(createdDate, completedDates) {
  let start = createdDate;
  for (const day of completedDates) {
    if (day < start) start = day;
  }
  return start;
}

// Whether the habit is expected to be done on `day` (weekly: any day counts).
function isScheduledOn(habit, day) {
  return habit.frequency !== "custom" || (habit.targetDays || []).includes(dayOfWeek(day));
}

/**
 * Streaks over the habit's whole history up to today.
 */
function streaksFor(habit, completedDates, createdDate, today) {
  const start = habitStartDate(createdDate, completedDates);
  return computeStreaks(buildPeriods(habit, completedDates, start, today, today));
}

/**
 * Completion stats over [from, to], clipped to the habit's history and today.
 */
function statsFor(habit, completedDates, createdDate, today, { from, to } = {}) {
  const historyStart = habitStartDate(createdDate, completedDates);
  const rangeFrom = from ? maxDate(from, historyStart) : historyStart;
  const rangeTo = to && to < today ? to : today;
  const periods = buildPeriods(habit, completedDates, rangeFrom, rangeTo, today);

  return {
    from: rangeFrom,
    to: rangeTo,
    ...completionStats(periods),
    weekly: weeklyBreakdown(periods),
  };
}

module.exports = {
  buildPeriods,
  computeStreaks,
  trailingRun,
  completionStats,
  weeklyBreakdown,
  habitStartDate,
  isScheduledOn,
  streaksFor,
  statsFor,
};

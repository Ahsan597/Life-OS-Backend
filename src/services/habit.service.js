const habitRepository = require("../repositories/habit.repository");
const habitLogRepository = require("../repositories/habitLog.repository");
const userService = require("./user.service");
const streakService = require("./streak.service");
const { scheduleIssues } = require("../validators/habit.validators");
const AppError = require("../utils/AppError");
const { getTodayForUser, resolveLogicalDate, toDbDate, fromDbDate } = require("../utils/dateUtils");

function toPublicHabit(habit) {
  return {
    id: habit.id.toString(),
    title: habit.title,
    description: habit.description,
    frequency: habit.frequency,
    targetDays: habit.targetDays,
    isActive: habit.isActive,
    createdAt: habit.createdAt,
    updatedAt: habit.updatedAt,
  };
}

function toPublicLog(log) {
  return {
    id: log.id.toString(),
    habitId: log.habitId.toString(),
    date: fromDbDate(log.logDate),
    completed: log.completed,
    note: log.note,
    createdAt: log.createdAt,
  };
}

async function getOwnedHabit(habitId, userId) {
  const habit = await habitRepository.findByIdForUser(habitId, userId);
  if (!habit) {
    throw new AppError("Habit not found", 404);
  }
  return habit;
}

// Archived habits keep their history but are read-only.
function assertActive(habit) {
  if (!habit.isActive) {
    throw new AppError("Habit is archived; unarchive it before logging", 409);
  }
}

/**
 * Completed log dates for several habits in one query (avoids N+1 on lists).
 * @returns {Map<bigint, Set<string>>} habitId -> YYYY-MM-DD dates
 */
async function loadCompletedDates(habitIds) {
  const byHabit = new Map(habitIds.map((id) => [id, new Set()]));
  if (habitIds.length === 0) return byHabit;

  const logs = await habitLogRepository.findCompletedByHabitIds(habitIds);
  for (const log of logs) {
    byHabit.get(log.habitId).add(fromDbDate(log.logDate));
  }
  return byHabit;
}

/**
 * Today's status + streaks for a habit, so the dashboard needs one call.
 */
function withProgress(habit, completedDates, timezone, today) {
  const createdDate = resolveLogicalDate(habit.createdAt, timezone);
  return {
    ...toPublicHabit(habit),
    today: {
      date: today,
      scheduled: streakService.isScheduledOn(habit, today),
      completed: completedDates.has(today),
    },
    ...streakService.streaksFor(habit, completedDates, createdDate, today),
  };
}

async function createHabit(userId, data) {
  const habit = await habitRepository.create({ userId, ...data });
  return toPublicHabit(habit);
}

async function listHabits(userId, { includeArchived }) {
  const [habits, timezone] = await Promise.all([
    habitRepository.findManyByUser(userId, { includeArchived }),
    userService.getTimezone(userId),
  ]);
  const today = getTodayForUser(timezone);
  const completedByHabit = await loadCompletedDates(habits.map((h) => h.id));
  return habits.map((habit) =>
    withProgress(habit, completedByHabit.get(habit.id), timezone, today)
  );
}

async function getHabit(userId, habitId) {
  const [habit, timezone] = await Promise.all([
    getOwnedHabit(habitId, userId),
    userService.getTimezone(userId),
  ]);
  const completedByHabit = await loadCompletedDates([habit.id]);
  return withProgress(habit, completedByHabit.get(habit.id), timezone, getTodayForUser(timezone));
}

async function updateHabit(userId, habitId, patch) {
  const habit = await getOwnedHabit(habitId, userId);

  // Switching away from "custom" drops its target days unless told otherwise.
  const changes = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (changes.frequency && changes.frequency !== "custom" && changes.targetDays === undefined) {
    changes.targetDays = null;
  }

  const issues = scheduleIssues({ ...habit, ...changes });
  if (issues.length > 0) {
    throw new AppError("Validation failed", 400, issues);
  }

  const updated = await habitRepository.update(habit.id, changes);
  return toPublicHabit(updated);
}

// Soft delete: archiving keeps the log history (database_design.txt principle #3).
async function archiveHabit(userId, habitId) {
  const habit = await getOwnedHabit(habitId, userId);
  if (habit.isActive) {
    await habitRepository.update(habit.id, { isActive: false });
  }
}

/**
 * Marks a habit done (or not done) for a day. Upserts, since a habit has at
 * most one log per day. `date` defaults to today in the user's timezone.
 */
async function logHabit(userId, habitId, { date, completed, note }) {
  const [habit, timezone] = await Promise.all([
    getOwnedHabit(habitId, userId),
    userService.getTimezone(userId),
  ]);
  assertActive(habit);

  const today = getTodayForUser(timezone);
  const logDate = date || today;
  if (logDate > today) {
    throw new AppError("Cannot log a habit for a future date", 400);
  }

  const dbDate = toDbDate(logDate);
  const existing = await habitLogRepository.findByHabitAndDate(habit.id, dbDate);
  const log = await habitLogRepository.upsert({
    habitId: habit.id,
    logDate: dbDate,
    completed,
    note,
  });

  return { log: toPublicLog(log), created: !existing };
}

async function listLogs(userId, habitId, { from, to }) {
  const habit = await getOwnedHabit(habitId, userId);
  const logs = await habitLogRepository.findManyByHabit(habit.id, {
    from: from && toDbDate(from),
    to: to && toDbDate(to),
  });
  return logs.map(toPublicLog);
}

async function updateLog(userId, logId, patch) {
  const log = await habitLogRepository.findByIdWithHabit(logId);
  // Someone else's log is reported as missing, not forbidden, to avoid leaking ids.
  if (!log || log.habit.userId !== userId) {
    throw new AppError("Log not found", 404);
  }
  assertActive(log.habit);

  const updated = await habitLogRepository.update(log.id, patch);
  return toPublicLog(updated);
}

async function getHabitStats(userId, habitId, range) {
  const [habit, timezone] = await Promise.all([
    getOwnedHabit(habitId, userId),
    userService.getTimezone(userId),
  ]);
  const today = getTodayForUser(timezone);
  const completedDates = (await loadCompletedDates([habit.id])).get(habit.id);
  const createdDate = resolveLogicalDate(habit.createdAt, timezone);

  return {
    habitId: habit.id.toString(),
    frequency: habit.frequency,
    ...streakService.streaksFor(habit, completedDates, createdDate, today),
    ...streakService.statsFor(habit, completedDates, createdDate, today, range),
  };
}

module.exports = {
  createHabit,
  listHabits,
  getHabit,
  updateHabit,
  archiveHabit,
  logHabit,
  listLogs,
  updateLog,
  getHabitStats,
  loadCompletedDates,
};

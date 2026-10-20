/**
 * Phase 2 "intelligence v1": statistics over data the user already logs.
 * Loads habits/logs/check-ins, resolves dates in the user's timezone, and
 * hands plain data to the pure correlation and rule modules.
 */
const habitRepository = require("../repositories/habit.repository");
const checkInRepository = require("../repositories/checkIn.repository");
const recommendationRepository = require("../repositories/recommendation.repository");
const userService = require("./user.service");
const { loadCompletedDates } = require("./habit.service");
const { resolveRange } = require("./checkIn.service");
const { habitStartDate } = require("./streak.service");
const { computeCorrelations, MIN_SAMPLE_SIZE } = require("./correlation.service");
const { evaluateRules } = require("./recommendationRules");
const AppError = require("../utils/AppError");
const {
  getTodayForUser,
  resolveLogicalDate,
  toDbDate,
  fromDbDate,
  addDays,
  minDate,
} = require("../utils/dateUtils");

// Correlations need weeks of data to mean anything, so default to ~3 months.
const CORRELATION_DEFAULT_DAYS = 90;
// The longest look-back any recommendation rule needs.
const RULES_CHECKIN_WINDOW_DAYS = 14;

/** Active habits with their completed days and the day their history starts. */
async function loadHabitContext(userId, timezone) {
  const habits = await habitRepository.findManyByUser(userId, { includeArchived: false });
  const completedByHabit = await loadCompletedDates(habits.map((h) => h.id));
  return habits.map((habit) => {
    const completedDates = completedByHabit.get(habit.id);
    return {
      id: habit.id.toString(),
      title: habit.title,
      frequency: habit.frequency,
      targetDays: habit.targetDays,
      start: habitStartDate(resolveLogicalDate(habit.createdAt, timezone), completedDates),
      completedDates,
    };
  });
}

async function loadCheckIns(userId, from, to) {
  if (from > to) return [];
  const rows = await checkInRepository.findManyInRange(userId, toDbDate(from), toDbDate(to));
  return rows.map((c) => ({
    date: fromDbDate(c.checkInDate),
    mood: c.mood,
    energy: c.energy,
    sleepHours: c.sleepHours === null ? null : Number(c.sleepHours),
    stressLevel: c.stressLevel,
  }));
}

/**
 * Pearson correlations between each check-in metric and habit completion,
 * overall and per habit. Today is left out: it is still in progress, so its
 * completion rate would read as artificially low.
 */
async function getCorrelations(userId, query) {
  const timezone = await userService.getTimezone(userId);
  const today = getTodayForUser(timezone);
  const { from, to } = resolveRange(query, today, CORRELATION_DEFAULT_DAYS);
  const analysisTo = minDate(to, addDays(today, -1));

  const [habits, checkIns] = await Promise.all([
    loadHabitContext(userId, timezone),
    loadCheckIns(userId, from, analysisTo),
  ]);

  return {
    from,
    to: analysisTo,
    minSampleSize: MIN_SAMPLE_SIZE,
    ...computeCorrelations(habits, checkIns, from, analysisTo),
  };
}

function toPublicRecommendation(rec) {
  return {
    id: rec.id.toString(),
    rule: rec.rule,
    source: rec.source,
    habitId: rec.habitId === null ? null : rec.habitId.toString(),
    habitTitle: rec.habit ? rec.habit.title : null,
    message: rec.message,
    reason: rec.reason,
    status: rec.status,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

/**
 * Re-evaluates every rule against the user's current data and syncs the
 * stored recommendations: new ones are added, pending ones that no longer
 * apply are removed, and accepted/dismissed ones are kept as history.
 */
async function syncRecommendations(userId) {
  const user = await userService.getUser(userId);
  const today = getTodayForUser(user.timezone);

  const [habits, checkIns, latest] = await Promise.all([
    loadHabitContext(userId, user.timezone),
    loadCheckIns(userId, addDays(today, -(RULES_CHECKIN_WINDOW_DAYS - 1)), today),
    checkInRepository.findLatest(userId),
  ]);

  const candidates = evaluateRules({
    today,
    habits,
    checkIns,
    lastCheckInDate: latest ? fromDbDate(latest.checkInDate) : null,
    userCreatedDate: resolveLogicalDate(user.createdAt, user.timezone),
  });

  await recommendationRepository.createManyIgnoringExisting(
    candidates.map((c) => ({
      userId,
      habitId: c.habitId === null ? null : BigInt(c.habitId),
      source: "rule_based",
      rule: c.rule,
      dedupeKey: c.dedupeKey,
      message: c.message,
      reason: c.reason,
    }))
  );
  await recommendationRepository.refreshPendingText(userId, candidates);
  await recommendationRepository.deleteStalePending(
    userId,
    candidates.map((c) => c.dedupeKey)
  );
}

async function getRecommendations(userId, { status }) {
  await syncRecommendations(userId);
  const rows = await recommendationRepository.findManyByUser(userId, {
    status: status === "all" ? undefined : status,
  });
  return rows.map(toPublicRecommendation);
}

async function updateRecommendationStatus(userId, id, status) {
  const rec = await recommendationRepository.findByIdForUser(id, userId);
  if (!rec) {
    throw new AppError("Recommendation not found", 404);
  }
  const updated = await recommendationRepository.updateStatus(rec.id, status);
  return toPublicRecommendation(updated);
}

module.exports = { getCorrelations, getRecommendations, updateRecommendationStatus };

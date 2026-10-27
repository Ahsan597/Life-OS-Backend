/**
 * Phase 3 "prediction": forecasts which habit streaks are likely to break,
 * and measures how accurate those forecasts have been. Loads the data,
 * resolves dates in the user's timezone, and hands it to the pure
 * streak-risk model and backtest.
 *
 * Nothing is stored: forecasts are computed on request, like correlations,
 * so they always reflect the latest logs and check-ins.
 */
const userService = require("./user.service");
const { loadHabitContext, loadCheckIns } = require("./analyticsContext.service");
const { resolveRange } = require("./checkIn.service");
const { MODEL_VERSION, SIGNAL_WINDOW_DAYS, assessHabits, byRisk } = require("./streakRisk.service");
const { backtest } = require("./predictionBacktest");
const { getTodayForUser, addDays, minDate } = require("../utils/dateUtils");

const ACCURACY_DEFAULT_DAYS = 30;

/**
 * Streak-risk forecasts for already-loaded habits (see analyticsContext),
 * highest risk first.
 */
async function forecastHabits(userId, habits, today) {
  const checkIns = await loadCheckIns(userId, addDays(today, -SIGNAL_WINDOW_DAYS), today);
  return assessHabits(habits, checkIns, today).sort(byRisk);
}

async function getStreakRisk(userId) {
  const timezone = await userService.getTimezone(userId);
  const today = getTodayForUser(timezone);
  const habits = await loadHabitContext(userId, timezone);
  return {
    date: today,
    modelVersion: MODEL_VERSION,
    habits: await forecastHabits(userId, habits, today),
  };
}

/**
 * Backtests the model over past days. Today is left out: its outcome isn't
 * known yet.
 */
async function getAccuracy(userId, query) {
  const timezone = await userService.getTimezone(userId);
  const today = getTodayForUser(timezone);
  const { from, to } = resolveRange(query, today, ACCURACY_DEFAULT_DAYS);
  const evaluateTo = minDate(to, addDays(today, -1));

  const [habits, checkIns] = await Promise.all([
    loadHabitContext(userId, timezone),
    loadCheckIns(userId, addDays(from, -SIGNAL_WINDOW_DAYS), evaluateTo),
  ]);

  return {
    from,
    to: evaluateTo,
    modelVersion: MODEL_VERSION,
    ...backtest(habits, checkIns, from, evaluateTo),
  };
}

module.exports = { forecastHabits, getStreakRisk, getAccuracy };

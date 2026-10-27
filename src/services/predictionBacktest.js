/**
 * Replays the streak-risk model over past days to measure how well it would
 * have forecast them. Pure: no DB access.
 *
 * Each case only sees habit logs from before the period it forecasts, so the
 * score is out-of-sample:
 *   daily/custom -> every scheduled day in the range; outcome = done that day
 *   weekly       -> every week whose Monday is in the range and that has
 *                   fully ended by `to`; outcome = done at least once that week
 *
 * The check-in of the forecast day is used, as the live model would use it.
 */
const { addDays, dayOfWeek } = require("../utils/dateUtils");
const { mean, round } = require("../utils/stats");
const { isScheduledOn } = require("./streak.service");
const { assessHabits } = require("./streakRisk.service");

const MONDAY = 1;
const RISK_LEVEL_ORDER = ["low", "medium", "high"];
const CALIBRATION_BUCKETS = [0, 0.2, 0.4, 0.6, 0.8].map((lo) => ({ lo, hi: lo + 0.2 }));

function isDue(habit, day, to) {
  if (habit.start >= day) return false;
  if (habit.frequency === "weekly") return dayOfWeek(day) === MONDAY && addDays(day, 6) <= to;
  return isScheduledOn(habit, day);
}

function completedBefore(completedDates, day) {
  return new Set([...completedDates].filter((d) => d < day));
}

function doneIn(habit, target) {
  if (target.period === "day") return habit.completedDates.has(target.date);
  for (let i = 0; i < 7; i++) {
    if (habit.completedDates.has(addDays(target.date, i))) return true;
  }
  return false;
}

function groupStats(cases) {
  return {
    predictions: cases.length,
    averagePredictedRisk: round(mean(cases.map((c) => c.riskScore)), 3),
    observedMissRate: round(mean(cases.map((c) => c.missed)), 3),
  };
}

/**
 * Brier score = mean squared gap between predicted risk and what happened
 * (0 = perfect, 0.25 = a coin flip). The baseline always predicts the
 * overall miss rate; `brierSkillScore` > 0 means the model beats it.
 */
function summarize(cases) {
  const observedMissRate = mean(cases.map((c) => c.missed));
  const brier = mean(cases.map((c) => (c.riskScore - c.missed) ** 2));
  const baseline =
    cases.length === 0 ? null : mean(cases.map((c) => (observedMissRate - c.missed) ** 2));

  return {
    evaluated: cases.length,
    observedMissRate: round(observedMissRate, 3),
    brierScore: round(brier, 4),
    baselineBrierScore: round(baseline, 4),
    brierSkillScore: baseline ? round(1 - brier / baseline, 3) : null,
    byRiskLevel: RISK_LEVEL_ORDER.map((riskLevel) => ({
      riskLevel,
      ...groupStats(cases.filter((c) => c.riskLevel === riskLevel)),
    })),
    calibration: CALIBRATION_BUCKETS.map(({ lo, hi }, i) => ({
      bucket: `${Math.round(lo * 100)}-${Math.round(hi * 100)}%`,
      ...groupStats(
        cases.filter((c) =>
          i === CALIBRATION_BUCKETS.length - 1
            ? c.riskScore >= lo
            : c.riskScore >= lo && c.riskScore < hi
        )
      ),
    })),
  };
}

/**
 * @param {object[]} habits same shape streakRisk.service takes
 * @param {object[]} checkIns covering [from - SIGNAL_WINDOW_DAYS, to]
 * @param {string} from first forecast day (inclusive)
 * @param {string} to   last day (inclusive); must be before today
 */
function backtest(habits, checkIns, from, to) {
  const cases = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const due = habits.filter((h) => isDue(h, day, to));
    if (due.length === 0) continue;

    const asOfDay = due.map((h) => ({
      ...h,
      completedDates: completedBefore(h.completedDates, day),
    }));
    for (const forecast of assessHabits(asOfDay, checkIns, day)) {
      if (forecast.riskLevel === "insufficient_data") continue;
      const habit = due.find((h) => h.id === forecast.habitId);
      cases.push({
        riskScore: forecast.riskScore,
        riskLevel: forecast.riskLevel,
        missed: doneIn(habit, forecast.target) ? 0 : 1,
      });
    }
  }
  return summarize(cases);
}

module.exports = { backtest, summarize };

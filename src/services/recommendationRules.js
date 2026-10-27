/**
 * Rule-based recommendation engine. Pure: every rule takes an already-loaded
 * context and returns zero or more candidates. No DB access, so each rule is
 * unit-testable on its own.
 *
 * Each candidate carries a `dedupeKey` naming ONE occurrence of the rule
 * firing, anchored to the date the situation started (e.g. the first missed
 * day of a run). The same situation keeps the same key, so a dismissed
 * recommendation stays dismissed; a new occurrence gets a new key.
 *
 * Context:
 *   today      user's current logical date
 *   habits     [{ id, title, frequency, targetDays, start, completedDates: Set }] (active only)
 *   checkIns   [{ date, mood, energy, sleepHours, stressLevel }] for the recent window, oldest first
 *   lastCheckInDate  most recent check-in date ever, or null
 *   userCreatedDate  account creation day
 *   streakRisks      streak-risk forecasts from streakRisk.service (optional)
 */
const { addDays, diffDays, weekStart } = require("../utils/dateUtils");
const { mean, round, slope } = require("../utils/stats");
const { buildPeriods, trailingRun } = require("./streak.service");

const MISSED_RUN = { daily: 3, custom: 3, weekly: 2 };
const LOW_COMPLETION = {
  windowDays: 28,
  minPeriods: { daily: 8, custom: 6, weekly: 4 },
  rate: 0.4,
};
const STREAK_MILESTONES = {
  daily: [7, 14, 30, 60, 100, 200, 365],
  custom: [7, 14, 30, 60, 100, 200, 365],
  weekly: [4, 8, 12, 26, 52],
};
const CHECKIN_GAP_DAYS = 3;
const LOW_SLEEP = { windowDays: 7, minDays: 4, hours: 6 };
const RISING_STRESS = { windowDays: 14, minDays: 5, slopePerDay: 0.05, recentAverage: 3 };
const STREAK_AT_RISK_MIN_STREAK = 3;

const unit = (habit, n) => {
  const word = habit.frequency === "weekly" ? "week" : "day";
  return `${n} ${word}${n === 1 ? "" : "s"}`;
};

function periodsFor(habit, today, from = habit.start) {
  const start = from > habit.start ? from : habit.start;
  return buildPeriods(habit, habit.completedDates, start, today, today);
}

// Several misses in a row: suggest shrinking the habit to restart momentum.
function missedInARow(ctx) {
  const out = [];
  for (const habit of ctx.habits) {
    const { length, startKey } = trailingRun(periodsFor(habit, ctx.today), false);
    if (length < MISSED_RUN[habit.frequency]) continue;
    out.push({
      rule: "missed_in_a_row",
      habitId: habit.id,
      dedupeKey: `missed_in_a_row:${habit.id}:${startKey}`,
      message: `You've missed "${habit.title}" ${length} times in a row. Try an easier version for now, like 5 minutes instead of the full thing, to get the streak going again.`,
      reason: `The last ${unit(habit, length)} it was scheduled were all missed.`,
    });
  }
  return out;
}

// Consistently low completion: the schedule is probably too ambitious.
function lowCompletion(ctx, skipHabitIds) {
  const out = [];
  const from = addDays(ctx.today, -(LOW_COMPLETION.windowDays - 1));
  for (const habit of ctx.habits) {
    if (skipHabitIds.has(habit.id)) continue;
    const counted = periodsFor(habit, ctx.today, from).filter((p) => !p.pending);
    if (counted.length < LOW_COMPLETION.minPeriods[habit.frequency]) continue;
    const rate = counted.filter((p) => p.completed).length / counted.length;
    if (rate >= LOW_COMPLETION.rate) continue;

    const suggestion = {
      daily: "Try scheduling it on fewer, specific days of the week instead of every day.",
      custom: "Try dropping one or two of its scheduled days.",
      weekly: "Try making each session smaller so it fits into a busy week.",
    }[habit.frequency];
    out.push({
      rule: "low_completion",
      habitId: habit.id,
      // One per habit per month at most.
      dedupeKey: `low_completion:${habit.id}:${ctx.today.slice(0, 7)}`,
      message: `You've completed "${habit.title}" only ${Math.round(rate * 100)}% of the time over the last 4 weeks. ${suggestion}`,
      reason: `Completion rate ${Math.round(rate * 100)}% over the last ${counted.length} scheduled ${habit.frequency === "weekly" ? "weeks" : "days"} (below ${LOW_COMPLETION.rate * 100}%).`,
    });
  }
  return out;
}

// A solid streak: celebrate and suggest levelling up.
function streakMilestone(ctx) {
  const out = [];
  for (const habit of ctx.habits) {
    const { length, startKey } = trailingRun(periodsFor(habit, ctx.today), true);
    const milestone = STREAK_MILESTONES[habit.frequency].filter((m) => m <= length).pop();
    if (!milestone) continue;
    out.push({
      rule: "streak_milestone",
      habitId: habit.id,
      dedupeKey: `streak_milestone:${habit.id}:${startKey}:${milestone}`,
      message: `${unit(habit, length)} in a row on "${habit.title}". It's becoming automatic, so consider levelling it up a little (longer, harder, or more often).`,
      reason: `Current streak reached the ${unit(habit, milestone)} milestone.`,
    });
  }
  return out;
}

// No recent check-ins: insights go stale without them.
function checkInGap(ctx) {
  const since = ctx.lastCheckInDate || ctx.userCreatedDate;
  const days = diffDays(since, ctx.today);
  if (days < CHECKIN_GAP_DAYS) return [];
  const never = !ctx.lastCheckInDate;
  return [
    {
      rule: "checkin_gap",
      habitId: null,
      dedupeKey: `checkin_gap:${never ? "never" : ctx.lastCheckInDate}`,
      message: never
        ? "You haven't done a daily check-in yet. Logging mood, energy, sleep and stress takes 30 seconds and unlocks insights about what helps your habits."
        : `It's been ${days} days since your last check-in. A quick check-in keeps your insights accurate.`,
      reason: never
        ? `No check-ins in the ${days} days since you joined.`
        : `Last check-in was on ${ctx.lastCheckInDate}.`,
    },
  ];
}

function recentValues(ctx, metric, windowDays) {
  const from = addDays(ctx.today, -(windowDays - 1));
  return ctx.checkIns.filter((c) => c.date >= from && c[metric] !== null);
}

// Short sleep on most recent nights.
function lowSleep(ctx) {
  const recent = recentValues(ctx, "sleepHours", LOW_SLEEP.windowDays);
  if (recent.length < LOW_SLEEP.minDays) return [];
  const average = mean(recent.map((c) => c.sleepHours));
  if (average >= LOW_SLEEP.hours) return [];
  return [
    {
      rule: "low_sleep",
      habitId: null,
      dedupeKey: `low_sleep:${weekStart(ctx.today)}`,
      message: `You've averaged ${round(average, 1)}h of sleep over the last week. Going to bed 30 minutes earlier is one of the easiest ways to make every other habit easier.`,
      reason: `Average sleep ${round(average, 1)}h across ${recent.length} check-ins in the last ${LOW_SLEEP.windowDays} days (below ${LOW_SLEEP.hours}h).`,
    },
  ];
}

// Stress trending up and already moderately high.
function risingStress(ctx) {
  const recent = recentValues(ctx, "stressLevel", RISING_STRESS.windowDays);
  if (recent.length < RISING_STRESS.minDays) return [];
  const from = addDays(ctx.today, -(RISING_STRESS.windowDays - 1));
  const perDay = slope(recent.map((c) => ({ x: diffDays(from, c.date), y: c.stressLevel })));
  const lastWeek = recentValues(ctx, "stressLevel", 7).map((c) => c.stressLevel);
  const recentAverage = mean(lastWeek);
  if (perDay === null || perDay < RISING_STRESS.slopePerDay) return [];
  if (recentAverage === null || recentAverage < RISING_STRESS.recentAverage) return [];
  return [
    {
      rule: "rising_stress",
      habitId: null,
      dedupeKey: `rising_stress:${weekStart(ctx.today)}`,
      message:
        "Your stress has been climbing over the last two weeks. Consider lightening your habit load for a few days, or adding something restorative like a walk or an early night.",
      reason: `Stress rose about ${round(perDay * 7, 1)} points per week over the last ${RISING_STRESS.windowDays} days; recent average ${round(recentAverage, 1)}/5.`,
    },
  ];
}

// A streak worth protecting is forecast to break in the open period: nudge
// before the miss happens rather than after.
function streakAtRisk(ctx) {
  return (ctx.streakRisks || [])
    .filter(
      (r) =>
        r.target.current && r.riskLevel === "high" && r.currentStreak >= STREAK_AT_RISK_MIN_STREAK
    )
    .map((r) => {
      const week = r.target.period === "week";
      const biggestRisk = r.factors.find((f) => f.effect === "raises_risk");
      return {
        rule: "streak_at_risk",
        habitId: r.habitId,
        dedupeKey: `streak_at_risk:${r.habitId}:${r.target.date}`,
        message: `Your ${r.currentStreak}-${week ? "week" : "day"} streak on "${r.title}" is at risk ${week ? "this week" : "today"}. Doing it early, even a small version, keeps it alive.`,
        reason: `Forecast: ${Math.round(r.riskScore * 100)}% chance of a miss.${biggestRisk ? ` ${biggestRisk.detail}` : ""}`,
      };
    });
}

/** Runs every rule and returns all candidates. */
function evaluateRules(ctx) {
  const missed = missedInARow(ctx);
  // A habit already flagged for a missed run doesn't also need a low-completion nudge.
  const flagged = new Set(missed.map((r) => r.habitId));
  return [
    ...missed,
    ...lowCompletion(ctx, flagged),
    ...streakMilestone(ctx),
    ...checkInGap(ctx),
    ...lowSleep(ctx),
    ...risingStress(ctx),
    ...streakAtRisk(ctx),
  ];
}

const RULES = [
  "missed_in_a_row",
  "low_completion",
  "streak_milestone",
  "checkin_gap",
  "low_sleep",
  "rising_stress",
  "streak_at_risk",
];

module.exports = {
  RULES,
  missedInARow,
  lowCompletion,
  streakMilestone,
  checkInGap,
  lowSleep,
  risingStress,
  streakAtRisk,
  evaluateRules,
};

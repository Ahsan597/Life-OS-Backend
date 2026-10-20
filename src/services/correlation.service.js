/**
 * Pure correlation math between check-in metrics and habit completion.
 * No DB access: callers pass in habits (with their completed dates and start
 * day), check-ins, and the date range already resolved in the user's timezone.
 *
 * Outcome per day:
 *   overall   -> share of the habits scheduled that day that were completed (0..1)
 *   per habit -> 1 if completed that day, 0 if scheduled but missed
 *
 * Only daily and custom habits take part: a weekly habit has no "expected
 * today", so a single day's check-in can't be paired with it.
 */
const { addDays } = require("../utils/dateUtils");
const { mean, round, pearson } = require("../utils/stats");
const { isScheduledOn } = require("./streak.service");

const METRICS = ["sleepHours", "mood", "energy", "stressLevel"];

// Fewer paired days than this and a coefficient is mostly noise.
const MIN_SAMPLE_SIZE = 7;

// Conventional rule-of-thumb cut-offs for |r|.
function strengthOf(r) {
  const abs = Math.abs(r);
  if (abs < 0.1) return "negligible";
  if (abs < 0.3) return "weak";
  if (abs < 0.5) return "moderate";
  return "strong";
}

// "On days <phrase>, ..." for a higher value of each metric.
const HIGHER_PHRASE = {
  sleepHours: "you sleep more",
  mood: "your mood is better",
  energy: "your energy is higher",
  stressLevel: "you're more stressed",
};

const METRIC_LABEL = {
  sleepHours: "sleep",
  mood: "mood",
  energy: "energy",
  stressLevel: "stress",
};

function correlatable(habit) {
  return habit.frequency !== "weekly";
}

function* daysBetween(from, to) {
  for (let day = from; day <= to; day = addDays(day, 1)) yield day;
}

/**
 * @param {{start: string, frequency: string, targetDays: number[]|null, completedDates: Set<string>}[]} habits
 * @returns {Map<string, number>} day -> completion rate of that day's scheduled habits
 */
function dailyCompletionRates(habits, from, to) {
  const rates = new Map();
  for (const day of daysBetween(from, to)) {
    let scheduled = 0;
    let completed = 0;
    for (const habit of habits) {
      if (day < habit.start || !isScheduledOn(habit, day)) continue;
      scheduled += 1;
      if (habit.completedDates.has(day)) completed += 1;
    }
    if (scheduled > 0) rates.set(day, completed / scheduled);
  }
  return rates;
}

/** @returns {Map<string, 0|1>} day -> whether the habit was done, for scheduled days only */
function habitOutcomes(habit, from, to) {
  const outcomes = new Map();
  const start = habit.start > from ? habit.start : from;
  for (const day of daysBetween(start, to)) {
    if (isScheduledOn(habit, day)) outcomes.set(day, habit.completedDates.has(day) ? 1 : 0);
  }
  return outcomes;
}

function pairs(checkIns, metric, outcomes) {
  const points = [];
  for (const checkIn of checkIns) {
    const value = checkIn[metric];
    if (value === null || value === undefined || !outcomes.has(checkIn.date)) continue;
    points.push({ x: value, y: outcomes.get(checkIn.date) });
  }
  return points;
}

function summarize(metric, r, strength, sampleSize, subject) {
  const label = METRIC_LABEL[metric];
  if (strength === "insufficient_data") {
    return `Not enough data yet: ${MIN_SAMPLE_SIZE} days with both ${label} logged and habits scheduled are needed (you have ${sampleSize}).`;
  }
  if (strength === "no_variation") {
    return `Not enough variation yet to compare your ${label} with ${subject.noun}.`;
  }
  if (strength === "negligible") {
    return `No clear link between your ${label} and ${subject.noun}.`;
  }
  return `On days ${HIGHER_PHRASE[metric]}, ${r > 0 ? subject.more : subject.less}.`;
}

function correlate(metric, checkIns, outcomes, subject) {
  const points = pairs(checkIns, metric, outcomes);
  const sampleSize = points.length;
  let r = null;
  let strength;

  if (sampleSize < MIN_SAMPLE_SIZE) {
    strength = "insufficient_data";
  } else {
    r = pearson(points);
    strength = r === null ? "no_variation" : strengthOf(r);
  }

  return {
    metric,
    r: round(r, 3),
    sampleSize,
    strength,
    direction: r === null || strength === "negligible" ? null : r > 0 ? "positive" : "negative",
    summary: summarize(metric, r, strength, sampleSize, subject),
  };
}

const SLEEP_BUCKETS = [
  { label: "<6h", test: (h) => h < 6 },
  { label: "6-7h", test: (h) => h >= 6 && h < 7 },
  { label: "7-8h", test: (h) => h >= 7 && h < 8 },
  { label: "8h+", test: (h) => h >= 8 },
];
const SCALE_BUCKETS = [1, 2, 3, 4, 5].map((n) => ({ label: String(n), test: (v) => v === n }));

/**
 * Average daily completion rate grouped by metric value, for a simple bar
 * chart ("on 7-8h sleep days you complete 82% of your habits").
 */
function buckets(metric, checkIns, rates) {
  const defs = metric === "sleepHours" ? SLEEP_BUCKETS : SCALE_BUCKETS;
  const points = pairs(checkIns, metric, rates);
  return defs.map(({ label, test }) => {
    const ys = points.filter((p) => test(p.x)).map((p) => p.y);
    return { label, days: ys.length, averageCompletionRate: round(mean(ys), 3) };
  });
}

const OVERALL_SUBJECT = {
  noun: "how many of your habits you complete",
  more: "you complete more of your habits",
  less: "you complete fewer of your habits",
};

function habitSubject(title) {
  return {
    noun: `completing "${title}"`,
    more: `you're more likely to complete "${title}"`,
    less: `you're less likely to complete "${title}"`,
  };
}

const RANKED = new Set(["moderate", "strong"]);

/**
 * @param {{id: string, title: string, start: string, frequency: string, targetDays: number[]|null, completedDates: Set<string>}[]} habits
 * @param {{date: string, mood: number|null, energy: number|null, sleepHours: number|null, stressLevel: number|null}[]} checkIns
 * @param {string} from first day (inclusive)
 * @param {string} to   last day (inclusive); should be before today so no day is still open
 */
function computeCorrelations(habits, checkIns, from, to) {
  const eligible = habits.filter(correlatable);
  const rates = dailyCompletionRates(eligible, from, to);

  const overall = METRICS.map((metric) => ({
    ...correlate(metric, checkIns, rates, OVERALL_SUBJECT),
    buckets: buckets(metric, checkIns, rates),
  }));

  const perHabit = eligible.map((habit) => {
    const outcomes = habitOutcomes(habit, from, to);
    const subject = habitSubject(habit.title);
    return {
      habitId: habit.id,
      title: habit.title,
      correlations: METRICS.map((metric) => correlate(metric, checkIns, outcomes, subject)),
    };
  });

  // The findings worth showing as cards: moderate or strong, strongest first.
  const highlights = [
    ...overall.map(({ buckets: _buckets, ...c }) => ({ scope: "overall", habitId: null, ...c })),
    ...perHabit.flatMap(({ habitId, title, correlations }) =>
      correlations.map((c) => ({ scope: "habit", habitId, habitTitle: title, ...c }))
    ),
  ]
    .filter((c) => RANKED.has(c.strength))
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  return { overall, habits: perHabit, highlights };
}

module.exports = {
  METRICS,
  MIN_SAMPLE_SIZE,
  strengthOf,
  dailyCompletionRates,
  habitOutcomes,
  computeCorrelations,
};

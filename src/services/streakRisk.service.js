/**
 * Streak-risk forecasting, model "heuristic_v1". Pure: no DB access.
 *
 * For each habit it forecasts the chance that the NEXT DUE period gets
 * completed: today (or this week) while it is still open, otherwise the next
 * scheduled day or week. `riskScore` is 1 minus that probability.
 *
 * How the probability is built:
 *   1. Base rate: completion over recent periods, weighted so newer periods
 *      count more (exponential decay) and shrunk toward 50% while history is
 *      short (a Beta prior), so "1 of 1" doesn't read as 100%.
 *   2. Day-of-week rate (daily/custom only): how often it gets done on the
 *      target weekday, shrunk toward the base rate, then blended in.
 *   3. Adjustments on the log-odds scale, which keeps the result inside
 *      (0, 1) however they add up:
 *        - a run of misses lowers it
 *        - an established streak raises it a little
 *        - today's check-in, for metrics that correlate with this habit
 *          (see correlation.service), moves it the way the correlation points.
 *
 * Feature extraction (`extractFeatures`) is kept apart from scoring
 * (`scoreFeatures`) so a learned model, e.g. a Python /predict service, can
 * later take the same features and replace only the scoring step.
 */
const { addDays, dayOfWeek, weekStart } = require("../utils/dateUtils");
const { mean, standardDeviation, round } = require("../utils/stats");
const { buildPeriods, computeStreaks, trailingRun, isScheduledOn } = require("./streak.service");
const { METRICS, computeCorrelations } = require("./correlation.service");

const MODEL_VERSION = "heuristic_v1";

// How many periods it takes for a period's weight in the base rate to halve.
const HALF_LIFE = { daily: 7, custom: 4, weekly: 3 };
// Periods older than this barely count anyway.
const HISTORY_WINDOW = { daily: 60, custom: 36, weekly: 26 };
// Beta prior: worth 2 periods at 50%.
const PRIOR = { rate: 0.5, weight: 2 };
const DAY_OF_WEEK = { lookbackWeeks: 12, shrinkWeight: 3, blend: 0.4, minSamples: 3 };
const MISS_RUN = { perMiss: -0.35, cap: 5 };
const STREAK = { scale: 0.2, cap: 0.8, minToMention: 3 };
const CHECKIN = { weight: 0.8, zCap: 2, cap: 1, minBaselineDays: 7 };
// Check-in history behind baselines and correlations; same as /insights/correlations.
const SIGNAL_WINDOW_DAYS = 90;
const PROBABILITY = { min: 0.02, max: 0.98 };
// Fewer counted periods than `min` is too little history to forecast from.
const HISTORY_CONFIDENCE = {
  min: { daily: 5, custom: 4, weekly: 3 },
  high: { daily: 28, custom: 12, weekly: 8 },
};
const RISK_LEVELS = { high: 0.6, medium: 0.35 };
// Adjustments smaller than this (in log-odds) aren't worth explaining.
const MIN_IMPACT = 0.1;

const LINKED_STRENGTHS = new Set(["moderate", "strong"]);
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const METRIC_LABEL = { sleepHours: "sleep", mood: "mood", energy: "energy", stressLevel: "stress" };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const percent = (rate) => `${Math.round(rate * 100)}%`;
const formatMetric = (metric, value) => (metric === "sleepHours" ? `${value}h` : `${value}/5`);

/**
 * The period the forecast is for. `current` means it is today (or this
 * week) and still open, so the streak is on the line right now.
 * Null only for a custom habit with no target days (nothing is ever due).
 */
function nextDuePeriod(habit, today, periods) {
  const last = periods[periods.length - 1];
  const period = habit.frequency === "weekly" ? "week" : "day";
  if (last && last.pending) return { period, date: last.key, current: true };
  if (period === "week") return { period, date: addDays(weekStart(today), 7), current: false };
  for (let i = 1; i <= 7; i++) {
    const day = addDays(today, i);
    if (isScheduledOn(habit, day)) return { period, date: day, current: false };
  }
  return null;
}

function recencyWeightedRate(counted, halfLife) {
  let weightSum = 0;
  let completed = 0;
  counted.forEach((period, i) => {
    const weight = 0.5 ** ((counted.length - 1 - i) / halfLife);
    weightSum += weight;
    if (period.completed) completed += weight;
  });
  return (completed + PRIOR.rate * PRIOR.weight) / (weightSum + PRIOR.weight);
}

function dayOfWeekStats(counted, target, today, baseRate) {
  const since = addDays(today, -7 * DAY_OF_WEEK.lookbackWeeks);
  const day = dayOfWeek(target.date);
  const same = counted.filter((p) => p.key >= since && dayOfWeek(p.key) === day);
  const completed = same.filter((p) => p.completed).length;
  return {
    day,
    samples: same.length,
    completed,
    rate:
      (completed + DAY_OF_WEEK.shrinkWeight * baseRate) / (same.length + DAY_OF_WEEK.shrinkWeight),
  };
}

/**
 * Mean and spread of each check-in metric, so today's value can be read as
 * "above/below usual". Metrics without enough varied history are left out.
 */
function metricBaselines(checkIns) {
  const baselines = {};
  for (const metric of METRICS) {
    const values = checkIns.map((c) => c[metric]).filter((v) => v !== null && v !== undefined);
    const sd = standardDeviation(values);
    if (values.length >= CHECKIN.minBaselineDays && sd) {
      baselines[metric] = { mean: mean(values), sd };
    }
  }
  return baselines;
}

/**
 * Today's check-in values that matter for this habit: only metrics with a
 * moderate or strong correlation, and only when the forecast is for today.
 */
function checkInSignals(target, { todayCheckIn, baselines = {}, correlations = [] }) {
  if (!target.current || target.period !== "day" || !todayCheckIn) return [];
  return correlations
    .filter((c) => LINKED_STRENGTHS.has(c.strength))
    .flatMap(({ metric, r }) => {
      const value = todayCheckIn[metric];
      const baseline = baselines[metric];
      if (value === null || value === undefined || !baseline) return [];
      const z = clamp((value - baseline.mean) / baseline.sd, -CHECKIN.zCap, CHECKIN.zCap);
      return [{ metric, r, value, usual: round(baseline.mean, 1), z }];
    });
}

/**
 * @param {{frequency: string, targetDays: number[]|null, start: string, completedDates: Set<string>}} habit
 * @param {string} today user's current logical date
 * @param {{todayCheckIn?: object|null, baselines?: object, correlations?: object[]}} signals
 * @returns {object|null} null when nothing is ever due
 */
function extractFeatures(habit, today, signals = {}) {
  const periods = buildPeriods(habit, habit.completedDates, habit.start, today, today);
  const target = nextDuePeriod(habit, today, periods);
  if (!target) return null;

  const counted = periods.filter((p) => !p.pending).slice(-HISTORY_WINDOW[habit.frequency]);
  const baseRate = recencyWeightedRate(counted, HALF_LIFE[habit.frequency]);
  const lastTen = counted.slice(-10);

  return {
    frequency: habit.frequency,
    target,
    sampleSize: counted.length,
    recent: { completed: lastTen.filter((p) => p.completed).length, total: lastTen.length },
    baseRate,
    dayOfWeek: target.period === "day" ? dayOfWeekStats(counted, target, today, baseRate) : null,
    currentStreak: computeStreaks(periods).currentStreak,
    missRun: trailingRun(periods, false).length,
    checkIns: checkInSignals(target, signals),
  };
}

/** Features -> completion probability, plus each adjustment in log-odds. */
function scoreFeatures(features) {
  const base = features.dayOfWeek
    ? (1 - DAY_OF_WEEK.blend) * features.baseRate + DAY_OF_WEEK.blend * features.dayOfWeek.rate
    : features.baseRate;

  const adjustments = {
    missRun: MISS_RUN.perMiss * Math.min(features.missRun, MISS_RUN.cap),
    streak: Math.min(STREAK.scale * Math.log1p(features.currentStreak), STREAK.cap),
    checkIns: features.checkIns.map((s) => CHECKIN.weight * s.r * s.z),
  };
  const checkInTotal = clamp(
    adjustments.checkIns.reduce((sum, a) => sum + a, 0),
    -CHECKIN.cap,
    CHECKIN.cap
  );

  const probability = clamp(
    sigmoid(
      logit(clamp(base, PROBABILITY.min, PROBABILITY.max)) +
        adjustments.missRun +
        adjustments.streak +
        checkInTotal
    ),
    PROBABILITY.min,
    PROBABILITY.max
  );
  return { probability, adjustments };
}

/** Plain-language reasons behind a forecast, for the UI. */
function explain(features, adjustments) {
  const weekly = features.frequency === "weekly";
  const unit = (n) => `${n} ${weekly ? "week" : "scheduled day"}${n === 1 ? "" : "s"}`;
  const factors = [];

  const { completed, total } = features.recent;
  if (total > 0) {
    factors.push({
      factor: "recent_completion",
      effect: features.baseRate >= 0.5 ? "lowers_risk" : "raises_risk",
      detail: `Done ${completed} of the last ${unit(total)}.`,
    });
  }

  const dow = features.dayOfWeek;
  if (dow && dow.samples >= DAY_OF_WEEK.minSamples) {
    const raw = dow.completed / dow.samples;
    if (Math.abs(raw - features.baseRate) >= 0.1) {
      factors.push({
        factor: "day_of_week",
        effect: raw > features.baseRate ? "lowers_risk" : "raises_risk",
        detail: `Done on ${dow.completed} of the last ${dow.samples} ${DAY_NAMES[dow.day]}s (${percent(raw)}, vs ${percent(features.baseRate)} recently overall).`,
      });
    }
  }

  if (features.missRun > 0) {
    factors.push({
      factor: "miss_run",
      effect: "raises_risk",
      detail:
        features.missRun === 1
          ? `Missed the last ${weekly ? "week" : "scheduled day"}.`
          : `Missed the last ${unit(features.missRun)} in a row.`,
    });
  }

  if (features.currentStreak >= STREAK.minToMention) {
    factors.push({
      factor: "streak",
      effect: "lowers_risk",
      detail: `A ${features.currentStreak}-${weekly ? "week" : "day"} streak is building momentum.`,
    });
  }

  features.checkIns.forEach((s, i) => {
    if (Math.abs(adjustments.checkIns[i]) < MIN_IMPACT) return;
    const helps = adjustments.checkIns[i] > 0;
    factors.push({
      factor: "checkin",
      metric: s.metric,
      effect: helps ? "lowers_risk" : "raises_risk",
      detail: `Today's ${METRIC_LABEL[s.metric]} (${formatMetric(s.metric, s.value)}) is ${s.z > 0 ? "above" : "below"} your usual ${formatMetric(s.metric, s.usual)}; you've tended to ${helps ? "do it more" : "skip it more"} on days like that.`,
    });
  });

  return factors;
}

function confidenceOf(frequency, sampleSize) {
  if (sampleSize < HISTORY_CONFIDENCE.min[frequency]) return "low";
  return sampleSize < HISTORY_CONFIDENCE.high[frequency] ? "medium" : "high";
}

function riskLevelOf(risk) {
  if (risk >= RISK_LEVELS.high) return "high";
  return risk >= RISK_LEVELS.medium ? "medium" : "low";
}

/**
 * One habit's forecast.
 * @param {{id: string, title: string} & object} habit see extractFeatures
 */
function assessHabit(habit, today, signals = {}) {
  const features = extractFeatures(habit, today, signals);
  if (!features) return null;
  const { probability, adjustments } = scoreFeatures(features);
  const confidence = confidenceOf(habit.frequency, features.sampleSize);
  const risk = 1 - probability;

  return {
    habitId: habit.id,
    title: habit.title,
    frequency: habit.frequency,
    currentStreak: features.currentStreak,
    target: features.target,
    completionProbability: round(probability, 3),
    riskScore: round(risk, 3),
    riskLevel: confidence === "low" ? "insufficient_data" : riskLevelOf(risk),
    confidence,
    factors: explain(features, adjustments),
    modelVersion: MODEL_VERSION,
  };
}

/**
 * Forecasts for several habits as of `today`.
 * @param {object[]} habits see extractFeatures
 * @param {object[]} checkIns should cover [today - SIGNAL_WINDOW_DAYS, today];
 *        anything outside is ignored
 */
function assessHabits(habits, checkIns, today) {
  const from = addDays(today, -SIGNAL_WINDOW_DAYS);
  const yesterday = addDays(today, -1);
  const history = checkIns.filter((c) => c.date >= from && c.date <= yesterday);
  const signals = {
    todayCheckIn: checkIns.find((c) => c.date === today) || null,
    baselines: metricBaselines(history),
  };
  const correlations = new Map(
    computeCorrelations(habits, history, from, yesterday).habits.map((h) => [
      h.habitId,
      h.correlations,
    ])
  );

  return habits
    .map((habit) =>
      assessHabit(habit, today, { ...signals, correlations: correlations.get(habit.id) || [] })
    )
    .filter(Boolean);
}

// Highest risk first; forecasts without enough history go last.
function byRisk(a, b) {
  const unknown = (r) => (r.riskLevel === "insufficient_data" ? 1 : 0);
  return unknown(a) - unknown(b) || b.riskScore - a.riskScore;
}

module.exports = {
  MODEL_VERSION,
  SIGNAL_WINDOW_DAYS,
  RISK_LEVELS,
  nextDuePeriod,
  metricBaselines,
  extractFeatures,
  scoreFeatures,
  assessHabit,
  assessHabits,
  byRisk,
};

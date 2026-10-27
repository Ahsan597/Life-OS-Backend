/**
 * Personalized ordering of recommendations. Pure: no DB access.
 *
 * Each pending recommendation gets a 0-100 score from four multipliers:
 *   ruleWeight  how much that kind of advice matters in general
 *   habitRisk   advice about a habit matters more when its streak is at risk
 *               (milestone "level it up" advice matters less then)
 *   feedback    how often THIS user accepted vs dismissed this rule before
 *               (smoothed, so one dismissal doesn't bury a rule forever)
 *   freshness   new advice ranks slightly above advice that's been ignored
 *
 * Accepted/dismissed recommendations are history, not suggestions: they get
 * no score and sort after every pending one.
 */
const { round } = require("../utils/stats");

const RULE_WEIGHT = {
  streak_at_risk: 1,
  missed_in_a_row: 0.85,
  rising_stress: 0.75,
  low_sleep: 0.7,
  low_completion: 0.65,
  checkin_gap: 0.55,
  streak_milestone: 0.45,
};
const DEFAULT_RULE_WEIGHT = 0.5;
// Rules whose advice is less urgent the riskier the habit is.
const RISK_INVERTED_RULES = new Set(["streak_milestone"]);
const HABIT_RISK = { min: 0.75, span: 0.5 }; // 0.75 .. 1.25
// Beta(1, 1) prior on the acceptance rate; the multiplier is 0.5 .. 1.5.
const FEEDBACK_PRIOR = { accepted: 1, dismissed: 1 };
const FRESHNESS = { start: 1.1, perDay: 0.02, floor: 0.8 };
const MAX_PRODUCT = 1 * (HABIT_RISK.min + HABIT_RISK.span) * 1.5 * FRESHNESS.start;
const PRIORITY = { high: 60, medium: 35 };
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function priorityOf(score) {
  if (score >= PRIORITY.high) return "high";
  return score >= PRIORITY.medium ? "medium" : "low";
}

/**
 * @param {{rule: string, habitId: string|null, createdAt: Date}} rec
 * @param {{riskByHabit: Map<string, number>, feedbackByRule: Map<string, {accepted: number, dismissed: number}>, now: Date}} context
 */
function scoreRecommendation(rec, { riskByHabit, feedbackByRule, now }) {
  const ruleWeight = RULE_WEIGHT[rec.rule] ?? DEFAULT_RULE_WEIGHT;

  const risk = rec.habitId === null ? undefined : riskByHabit.get(rec.habitId);
  let habitRisk = 1;
  if (risk !== undefined) {
    const relevance = RISK_INVERTED_RULES.has(rec.rule) ? 1 - risk : risk;
    habitRisk = HABIT_RISK.min + HABIT_RISK.span * relevance;
  }

  const { accepted = 0, dismissed = 0 } = feedbackByRule.get(rec.rule) || {};
  const acceptance =
    (accepted + FEEDBACK_PRIOR.accepted) /
    (accepted + dismissed + FEEDBACK_PRIOR.accepted + FEEDBACK_PRIOR.dismissed);
  const feedback = 0.5 + acceptance;

  const ageDays = Math.max(0, (now - new Date(rec.createdAt)) / MS_PER_DAY);
  const freshness = Math.max(FRESHNESS.floor, FRESHNESS.start - FRESHNESS.perDay * ageDays);

  const score = Math.round((100 * ruleWeight * habitRisk * feedback * freshness) / MAX_PRODUCT);
  return {
    score,
    priority: priorityOf(score),
    scoreFactors: {
      ruleWeight,
      habitRisk: round(habitRisk, 2),
      feedback: round(feedback, 2),
      freshness: round(freshness, 2),
    },
  };
}

/** Adds score/priority/scoreFactors to each recommendation, keeping order. */
function scoreRecommendations(recs, context) {
  return recs.map((rec) =>
    rec.status === "pending"
      ? { ...rec, ...scoreRecommendation(rec, context) }
      : { ...rec, score: null, priority: null, scoreFactors: null }
  );
}

/** Comparator: pending by score (highest first), then the rest. Use with a stable sort. */
function byRank(a, b) {
  const unscored = (r) => (r.score === null ? 1 : 0);
  return unscored(a) - unscored(b) || (b.score ?? 0) - (a.score ?? 0);
}

module.exports = { RULE_WEIGHT, scoreRecommendation, scoreRecommendations, byRank };

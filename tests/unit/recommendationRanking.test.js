const {
  scoreRecommendation,
  scoreRecommendations,
  byRank,
} = require("../../src/services/recommendationRanking");

const NOW = new Date("2026-03-10T12:00:00Z");

function rec(overrides) {
  return {
    id: "1",
    rule: "missed_in_a_row",
    habitId: null,
    status: "pending",
    createdAt: NOW,
    ...overrides,
  };
}

function ctx(overrides) {
  return { riskByHabit: new Map(), feedbackByRule: new Map(), now: NOW, ...overrides };
}

describe("recommendation ranking", () => {
  it("scores 0-100 with a priority and the factors behind it", () => {
    const r = scoreRecommendation(rec({ rule: "streak_at_risk" }), ctx());
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.priority).toBe("medium");
    expect(r.scoreFactors).toEqual({ ruleWeight: 1, habitRisk: 1, feedback: 1, freshness: 1.1 });
  });

  it("weighs rules by importance", () => {
    const urgent = scoreRecommendation(rec({ rule: "missed_in_a_row" }), ctx()).score;
    const nice = scoreRecommendation(rec({ rule: "streak_milestone" }), ctx()).score;
    expect(urgent).toBeGreaterThan(nice);
  });

  it("boosts advice for at-risk habits, but not 'level up' advice", () => {
    const risky = ctx({ riskByHabit: new Map([["7", 0.9]]) });
    const safe = ctx({ riskByHabit: new Map([["7", 0.1]]) });
    const missed = rec({ habitId: "7" });
    const milestone = rec({ habitId: "7", rule: "streak_milestone" });

    expect(scoreRecommendation(missed, risky).score).toBeGreaterThan(
      scoreRecommendation(missed, safe).score
    );
    expect(scoreRecommendation(milestone, risky).score).toBeLessThan(
      scoreRecommendation(milestone, safe).score
    );
  });

  it("learns from the user's accept/dismiss history per rule", () => {
    const likes = ctx({ feedbackByRule: new Map([["low_sleep", { accepted: 4, dismissed: 0 }]]) });
    const dislikes = ctx({
      feedbackByRule: new Map([["low_sleep", { accepted: 0, dismissed: 4 }]]),
    });
    const sleep = rec({ rule: "low_sleep" });

    expect(scoreRecommendation(sleep, likes).scoreFactors.feedback).toBeCloseTo(1.33, 2);
    expect(scoreRecommendation(sleep, dislikes).scoreFactors.feedback).toBeCloseTo(0.67, 2);
    expect(scoreRecommendation(sleep, likes).score).toBeGreaterThan(
      scoreRecommendation(sleep, dislikes).score
    );
  });

  it("slowly demotes advice that has been sitting unanswered", () => {
    const old = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(scoreRecommendation(rec({ createdAt: old }), ctx()).scoreFactors.freshness).toBe(0.8);
  });

  it("ranks pending by score and leaves decided ones unscored at the end", () => {
    const recs = [
      rec({ id: "a", rule: "checkin_gap" }),
      rec({ id: "b", rule: "missed_in_a_row", status: "dismissed" }),
      rec({ id: "c", rule: "streak_at_risk" }),
      rec({ id: "d", rule: "low_sleep" }),
    ];
    const ranked = scoreRecommendations(recs, ctx()).sort(byRank);

    expect(ranked.map((r) => r.id)).toEqual(["c", "d", "a", "b"]);
    expect(ranked[3]).toMatchObject({ score: null, priority: null, scoreFactors: null });
  });
});

const { backtest, summarize } = require("../../src/services/predictionBacktest");
const { addDays } = require("../../src/utils/dateUtils");

// 2026-03-02 is a Monday.
const MON = "2026-03-02";
const range = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));

function habit(overrides) {
  return {
    id: "1",
    title: "Read",
    frequency: "daily",
    targetDays: null,
    start: MON,
    completedDates: new Set(),
    ...overrides,
  };
}

describe("prediction backtest", () => {
  it("summarize computes Brier scores against the base-rate baseline", () => {
    const cases = [
      { riskScore: 0.9, riskLevel: "high", missed: 1 },
      { riskScore: 0.8, riskLevel: "high", missed: 1 },
      { riskScore: 0.2, riskLevel: "low", missed: 0 },
      { riskScore: 0.1, riskLevel: "low", missed: 0 },
    ];
    const s = summarize(cases);

    expect(s.evaluated).toBe(4);
    expect(s.observedMissRate).toBe(0.5);
    expect(s.brierScore).toBeCloseTo((0.01 + 0.04 + 0.04 + 0.01) / 4, 4);
    expect(s.baselineBrierScore).toBe(0.25);
    expect(s.brierSkillScore).toBeCloseTo(0.9, 3);
    expect(s.byRiskLevel.find((g) => g.riskLevel === "high")).toEqual({
      riskLevel: "high",
      predictions: 2,
      averagePredictedRisk: 0.85,
      observedMissRate: 1,
    });
    expect(s.byRiskLevel.find((g) => g.riskLevel === "medium").predictions).toBe(0);
    expect(s.calibration.map((b) => b.bucket)).toEqual([
      "0-20%",
      "20-40%",
      "40-60%",
      "60-80%",
      "80-100%",
    ]);
    expect(s.calibration[4].predictions).toBe(2);
  });

  it("summarize handles no cases", () => {
    expect(summarize([])).toMatchObject({
      evaluated: 0,
      observedMissRate: null,
      brierScore: null,
      brierSkillScore: null,
    });
  });

  it("only uses logs from before the forecast day", () => {
    // Missed for 10 days, then done on day 10. Forecasting day 10 must not
    // see that completion, so it is a high-risk forecast that turned out wrong.
    const day10 = addDays(MON, 10);
    const s = backtest([habit({ completedDates: new Set([day10]) })], [], day10, day10);
    expect(s.evaluated).toBe(1);
    expect(s.byRiskLevel.find((g) => g.riskLevel === "high")).toMatchObject({
      predictions: 1,
      observedMissRate: 0,
    });
  });

  it("evaluates scheduled days with enough history, and only fully ended weeks", () => {
    const from = addDays(MON, 21); // a Monday
    const to = addDays(from, 9); // the Wednesday of the following week
    const habits = [
      habit({ id: "1", completedDates: new Set(range(MON, 31)) }),
      // Mon/Wed/Fri: 5 scheduled days in the range.
      habit({ id: "2", frequency: "custom", targetDays: [1, 3, 5] }),
      // Only the week starting `from` has ended by `to`.
      habit({ id: "3", frequency: "weekly", completedDates: new Set([addDays(MON, 2)]) }),
    ];

    expect(backtest(habits, [], from, to).evaluated).toBe(10 + 5 + 1);
  });
});

const {
  nextDuePeriod,
  metricBaselines,
  assessHabit,
  assessHabits,
  byRisk,
} = require("../../src/services/streakRisk.service");
const { buildPeriods } = require("../../src/services/streak.service");
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

const checkIn = (date, values) => ({
  date,
  mood: null,
  energy: null,
  sleepHours: null,
  stressLevel: null,
  ...values,
});

const periodsOf = (h, today) => buildPeriods(h, h.completedDates, h.start, today, today);

describe("streak risk", () => {
  describe("nextDuePeriod", () => {
    const today = addDays(MON, 9); // Wednesday

    it("is today while today is still open", () => {
      const h = habit();
      expect(nextDuePeriod(h, today, periodsOf(h, today))).toEqual({
        period: "day",
        date: today,
        current: true,
      });
    });

    it("moves to the next scheduled day once today is done", () => {
      const daily = habit({ completedDates: new Set([today]) });
      expect(nextDuePeriod(daily, today, periodsOf(daily, today))).toMatchObject({
        date: addDays(today, 1),
        current: false,
      });

      // Mon/Fri habit on a Wednesday: next due is Friday.
      const custom = habit({ frequency: "custom", targetDays: [1, 5] });
      expect(nextDuePeriod(custom, today, periodsOf(custom, today))).toMatchObject({
        date: addDays(today, 2),
        current: false,
      });
    });

    it("uses weeks for weekly habits", () => {
      const open = habit({ frequency: "weekly" });
      expect(nextDuePeriod(open, today, periodsOf(open, today))).toEqual({
        period: "week",
        date: addDays(MON, 7),
        current: true,
      });

      const done = habit({ frequency: "weekly", completedDates: new Set([addDays(MON, 7)]) });
      expect(nextDuePeriod(done, today, periodsOf(done, today))).toEqual({
        period: "week",
        date: addDays(MON, 14),
        current: false,
      });
    });
  });

  describe("assessHabit", () => {
    const today = addDays(MON, 28);

    it("rates a consistent habit as low risk and explains why", () => {
      const r = assessHabit(habit({ completedDates: new Set(range(MON, 28)) }), today);
      expect(r).toMatchObject({
        habitId: "1",
        currentStreak: 28,
        riskLevel: "low",
        confidence: "high",
        modelVersion: "heuristic_v1",
        target: { period: "day", date: today, current: true },
      });
      expect(r.riskScore).toBeLessThan(0.15);
      expect(r.completionProbability + r.riskScore).toBeCloseTo(1);
      expect(r.factors.map((f) => f.factor)).toEqual(["recent_completion", "streak"]);
    });

    it("a run of misses raises the risk", () => {
      const steady = assessHabit(habit({ completedDates: new Set(range(MON, 28)) }), today);
      const slipping = assessHabit(habit({ completedDates: new Set(range(MON, 23)) }), today);

      expect(slipping.riskScore).toBeGreaterThan(steady.riskScore + 0.3);
      expect(slipping.riskLevel).toBe("high");
      expect(slipping.factors.find((f) => f.factor === "miss_run")).toMatchObject({
        effect: "raises_risk",
        detail: "Missed the last 5 scheduled days in a row.",
      });
    });

    it("never returns a certainty", () => {
      const never = assessHabit(habit(), addDays(MON, 60));
      expect(never.completionProbability).toBeGreaterThanOrEqual(0.02);
      const always = assessHabit(
        habit({ completedDates: new Set(range(MON, 60)) }),
        addDays(MON, 60)
      );
      expect(always.completionProbability).toBeLessThanOrEqual(0.98);
    });

    it("flags too little history instead of guessing a level", () => {
      const r = assessHabit(habit({ start: addDays(today, -2) }), today);
      expect(r).toMatchObject({ riskLevel: "insufficient_data", confidence: "low" });
      expect(r.riskScore).not.toBeNull();
    });

    it("notices a weak weekday", () => {
      // Done every day for 8 weeks except Mondays; today is a Monday.
      const monday = addDays(MON, 56);
      const done = range(MON, 56).filter((d, i) => i % 7 !== 0);
      const r = assessHabit(habit({ completedDates: new Set(done) }), monday);
      const dow = r.factors.find((f) => f.factor === "day_of_week");
      expect(dow).toMatchObject({ effect: "raises_risk" });
      expect(dow.detail).toContain("0 of the last 8 Mondays");

      const tuesday = assessHabit(habit({ completedDates: new Set(done) }), addDays(monday, 1));
      expect(r.riskScore).toBeGreaterThan(tuesday.riskScore);
    });

    describe("today's check-in", () => {
      const h = habit({ completedDates: new Set(range(MON, 28).filter((_, i) => i % 2 === 0)) });
      const signals = (sleepHours) => ({
        todayCheckIn: checkIn(today, { sleepHours }),
        baselines: { sleepHours: { mean: 7, sd: 1 } },
        correlations: [{ metric: "sleepHours", r: 0.8, strength: "strong" }],
      });

      it("moves the forecast the way the correlation points", () => {
        const short = assessHabit(h, today, signals(5));
        const long = assessHabit(h, today, signals(9));
        const none = assessHabit(h, today);

        expect(short.riskScore).toBeGreaterThan(none.riskScore);
        expect(long.riskScore).toBeLessThan(none.riskScore);
        expect(short.factors.find((f) => f.factor === "checkin")).toMatchObject({
          metric: "sleepHours",
          effect: "raises_risk",
        });
        expect(short.factors.find((f) => f.factor === "checkin").detail).toContain(
          "Today's sleep (5h) is below your usual 7h"
        );
      });

      it("ignores weak correlations and forecasts that aren't for today", () => {
        const weak = {
          ...signals(5),
          correlations: [{ metric: "sleepHours", r: 0.2, strength: "weak" }],
        };
        expect(assessHabit(h, today, weak).riskScore).toBe(assessHabit(h, today).riskScore);

        const doneToday = habit({ completedDates: new Set([...h.completedDates, today]) });
        expect(
          assessHabit(doneToday, today, signals(5)).factors.some((f) => f.factor === "checkin")
        ).toBe(false);
      });
    });
  });

  it("metricBaselines needs enough varied values", () => {
    const days = range(MON, 7);
    const varied = days.map((d, i) => checkIn(d, { sleepHours: 6 + (i % 3), mood: 3 }));
    const baselines = metricBaselines(varied);
    expect(baselines.sleepHours.mean).toBeCloseTo(6.857, 2);
    expect(baselines.mood).toBeUndefined(); // no variation
    expect(metricBaselines(varied.slice(0, 6))).toEqual({});
  });

  it("assessHabits feeds correlations from check-in history into today's forecast", () => {
    const today = addDays(MON, 20);
    // "Read" is done exactly on the 8h-sleep days.
    const days = range(MON, 20);
    const good = new Set(days.filter((_, i) => i % 2 === 0));
    const checkIns = days.map((d) => checkIn(d, { sleepHours: good.has(d) ? 8 : 5 }));
    const h = habit({ completedDates: good });

    const [tired] = assessHabits([h], [...checkIns, checkIn(today, { sleepHours: 5 })], today);
    const [rested] = assessHabits([h], [...checkIns, checkIn(today, { sleepHours: 8 })], today);

    expect(tired.factors.some((f) => f.factor === "checkin" && f.effect === "raises_risk")).toBe(
      true
    );
    expect(tired.riskScore).toBeGreaterThan(rested.riskScore);
  });

  it("byRisk puts the riskiest first and unknowns last", () => {
    const sorted = [
      { riskScore: 0.3, riskLevel: "low" },
      { riskScore: 0.9, riskLevel: "insufficient_data" },
      { riskScore: 0.7, riskLevel: "high" },
    ].sort(byRisk);
    expect(sorted.map((r) => r.riskScore)).toEqual([0.7, 0.3, 0.9]);
  });
});

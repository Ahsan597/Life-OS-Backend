const {
  strengthOf,
  dailyCompletionRates,
  habitOutcomes,
  computeCorrelations,
  MIN_SAMPLE_SIZE,
} = require("../../src/services/correlation.service");
const { addDays } = require("../../src/utils/dateUtils");

// 2026-03-02 is a Monday.
const MON = "2026-03-02";
const days = (n, from = MON) => Array.from({ length: n }, (_, i) => addDays(from, i));

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

describe("correlation service", () => {
  it("classifies |r| into strengths", () => {
    expect(strengthOf(0.05)).toBe("negligible");
    expect(strengthOf(-0.2)).toBe("weak");
    expect(strengthOf(0.4)).toBe("moderate");
    expect(strengthOf(-0.8)).toBe("strong");
  });

  describe("dailyCompletionRates", () => {
    it("is the share of that day's scheduled habits that were completed", () => {
      const a = habit({ id: "1", completedDates: new Set([MON]) });
      const b = habit({ id: "2" });
      const rates = dailyCompletionRates([a, b], MON, MON);
      expect(rates.get(MON)).toBe(0.5);
    });

    it("skips days before a habit started and unscheduled custom days", () => {
      // Mon/Wed/Fri only; Tuesday has nothing scheduled.
      const mwf = habit({ frequency: "custom", targetDays: [1, 3, 5], start: MON });
      const later = habit({ id: "2", start: addDays(MON, 3) });
      const rates = dailyCompletionRates([mwf, later], MON, addDays(MON, 1));
      expect(rates.has(MON)).toBe(true);
      expect(rates.has(addDays(MON, 1))).toBe(false);
    });
  });

  it("habitOutcomes is 1/0 per scheduled day from the habit's start", () => {
    const h = habit({ start: addDays(MON, 1), completedDates: new Set([addDays(MON, 1)]) });
    const outcomes = habitOutcomes(h, MON, addDays(MON, 2));
    expect([...outcomes]).toEqual([
      [addDays(MON, 1), 1],
      [addDays(MON, 2), 0],
    ]);
  });

  describe("computeCorrelations", () => {
    // 10 days: habit done exactly on the days with 8h sleep, missed on 5h days.
    const range = days(10);
    const done = range.filter((_, i) => i % 2 === 0);
    const read = habit({ completedDates: new Set(done) });
    const checkIns = range.map((d, i) => checkIn(d, { sleepHours: i % 2 === 0 ? 8 : 5, mood: 3 }));
    const result = computeCorrelations([read], checkIns, range[0], range[9]);
    const sleep = result.overall.find((c) => c.metric === "sleepHours");

    it("finds a strong positive overall correlation with a plain-language summary", () => {
      expect(sleep).toMatchObject({
        r: 1,
        sampleSize: 10,
        strength: "strong",
        direction: "positive",
        summary: "On days you sleep more, you complete more of your habits.",
      });
    });

    it("reports no_variation when a metric never changes", () => {
      const mood = result.overall.find((c) => c.metric === "mood");
      expect(mood).toMatchObject({ r: null, strength: "no_variation", direction: null });
    });

    it("reports insufficient_data below the minimum sample size", () => {
      const energy = result.overall.find((c) => c.metric === "energy");
      expect(energy).toMatchObject({ r: null, sampleSize: 0, strength: "insufficient_data" });
      expect(energy.summary).toContain(`${MIN_SAMPLE_SIZE} days`);
    });

    it("buckets average completion by metric value for charts", () => {
      expect(sleep.buckets).toEqual([
        { label: "<6h", days: 5, averageCompletionRate: 0 },
        { label: "6-7h", days: 0, averageCompletionRate: null },
        { label: "7-8h", days: 0, averageCompletionRate: null },
        { label: "8h+", days: 5, averageCompletionRate: 1 },
      ]);
    });

    it("correlates per habit and lists moderate/strong findings as highlights", () => {
      const perHabit = result.habits[0].correlations.find((c) => c.metric === "sleepHours");
      expect(perHabit.summary).toBe(
        'On days you sleep more, you\'re more likely to complete "Read".'
      );
      expect(result.highlights.map((h) => [h.scope, h.metric])).toEqual([
        ["overall", "sleepHours"],
        ["habit", "sleepHours"],
      ]);
      expect(result.highlights[1]).toMatchObject({ habitId: "1", habitTitle: "Read" });
    });

    it("leaves weekly habits out", () => {
      const weekly = habit({ id: "9", frequency: "weekly" });
      const r = computeCorrelations([weekly], checkIns, range[0], range[9]);
      expect(r.habits).toEqual([]);
      expect(r.overall[0].sampleSize).toBe(0);
    });
  });
});

const {
  missedInARow,
  lowCompletion,
  streakMilestone,
  checkInGap,
  lowSleep,
  risingStress,
  streakAtRisk,
  evaluateRules,
} = require("../../src/services/recommendationRules");
const { trailingRun } = require("../../src/services/streak.service");
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

function ctx(overrides) {
  return {
    today: addDays(MON, 13),
    habits: [],
    checkIns: [],
    lastCheckInDate: addDays(MON, 13),
    userCreatedDate: MON,
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

describe("recommendation rules", () => {
  it("trailingRun skips an open period at the end", () => {
    const periods = [
      { key: "a", completed: true, pending: false },
      { key: "b", completed: false, pending: false },
      { key: "c", completed: false, pending: false },
      { key: "d", completed: false, pending: true },
    ];
    expect(trailingRun(periods, false)).toEqual({ length: 2, startKey: "b" });
    expect(trailingRun(periods, true)).toEqual({ length: 0, startKey: null });
  });

  describe("missed_in_a_row", () => {
    const today = addDays(MON, 5);
    // Done Mon-Tue, then missed Wed, Thu, Fri; today (Sat) still open.
    const h = habit({ completedDates: new Set([MON, addDays(MON, 1)]) });

    it("fires after 3 missed scheduled days, keyed to the first miss", () => {
      const [rec] = missedInARow(ctx({ today, habits: [h] }));
      expect(rec).toMatchObject({
        rule: "missed_in_a_row",
        habitId: "1",
        dedupeKey: `missed_in_a_row:1:${addDays(MON, 2)}`,
      });
      expect(rec.message).toContain("3 times in a row");
    });

    it("keeps the same key as the run grows, so a dismissal sticks", () => {
      const [rec] = missedInARow(ctx({ today: addDays(today, 1), habits: [h] }));
      expect(rec.dedupeKey).toBe(`missed_in_a_row:1:${addDays(MON, 2)}`);
      expect(rec.message).toContain("4 times in a row");
    });

    it("does not fire for only 2 misses", () => {
      expect(missedInARow(ctx({ today: addDays(MON, 4), habits: [h] }))).toEqual([]);
    });

    it("counts only scheduled days for custom habits", () => {
      // Mon/Wed/Fri; done on the first Mon, missed Wed, Fri, next Mon.
      const mwf = habit({
        frequency: "custom",
        targetDays: [1, 3, 5],
        completedDates: new Set([MON]),
      });
      const [rec] = missedInARow(ctx({ today: addDays(MON, 8), habits: [mwf] }));
      expect(rec.reason).toContain("3 days");
    });
  });

  it("low_completion fires below 40% over 4 weeks and is skipped for flagged habits", () => {
    const today = addDays(MON, 27);
    // 8 of 28 days done (~29%), last done yesterday so no missed run.
    const done = new Set([...range(MON, 7), addDays(today, -1)]);
    const h = habit({ completedDates: done });
    const [rec] = lowCompletion(ctx({ today, habits: [h] }), new Set());
    expect(rec).toMatchObject({ rule: "low_completion", dedupeKey: "low_completion:1:2026-03" });
    expect(rec.message).toContain("fewer, specific days");
    expect(lowCompletion(ctx({ today, habits: [h] }), new Set(["1"]))).toEqual([]);
  });

  it("streak_milestone fires at 7 days, keyed to the streak start and milestone", () => {
    const today = addDays(MON, 7);
    const h = habit({ completedDates: new Set(range(MON, 7)) }); // Mon..Sun done, today open
    const [rec] = streakMilestone(ctx({ today, habits: [h] }));
    expect(rec).toMatchObject({ dedupeKey: `streak_milestone:1:${MON}:7` });
    expect(rec.message).toMatch(/^7 days in a row/);
    // Day 6 of the streak: below the first milestone.
    expect(streakMilestone(ctx({ today: addDays(MON, 5), habits: [h] }))).toEqual([]);
  });

  describe("checkin_gap", () => {
    it("fires 3+ days after the last check-in", () => {
      const [rec] = checkInGap(ctx({ today: addDays(MON, 10), lastCheckInDate: addDays(MON, 7) }));
      expect(rec).toMatchObject({ dedupeKey: `checkin_gap:${addDays(MON, 7)}` });
      expect(checkInGap(ctx({ today: addDays(MON, 9), lastCheckInDate: addDays(MON, 7) }))).toEqual(
        []
      );
    });

    it("nudges users who never checked in once their account is 3 days old", () => {
      const [rec] = checkInGap(ctx({ today: addDays(MON, 3), lastCheckInDate: null }));
      expect(rec.dedupeKey).toBe("checkin_gap:never");
    });
  });

  it("low_sleep fires when the last week averages under 6h with 4+ entries", () => {
    const today = addDays(MON, 13);
    const short = range(addDays(today, -3), 4).map((d) => checkIn(d, { sleepHours: 5 }));
    expect(lowSleep(ctx({ today, checkIns: short }))[0].message).toContain("5h");
    expect(lowSleep(ctx({ today, checkIns: short.slice(1) }))).toEqual([]);
  });

  it("rising_stress needs an upward trend and a high recent average", () => {
    const today = addDays(MON, 13);
    const rising = range(MON, 14).map((d, i) =>
      checkIn(d, { stressLevel: 1 + Math.floor(i / 3.5) })
    );
    expect(risingStress(ctx({ today, checkIns: rising }))).toHaveLength(1);
    const flatHigh = range(MON, 14).map((d) => checkIn(d, { stressLevel: 4 }));
    expect(risingStress(ctx({ today, checkIns: flatHigh }))).toEqual([]);
  });

  describe("streak_at_risk", () => {
    const forecast = (overrides) => ({
      habitId: "1",
      title: "Read",
      currentStreak: 5,
      target: { period: "day", date: MON, current: true },
      riskScore: 0.72,
      riskLevel: "high",
      factors: [
        { factor: "recent_completion", effect: "lowers_risk", detail: "Done 7 of the last 10." },
        { factor: "day_of_week", effect: "raises_risk", detail: "Rarely done on Mondays." },
      ],
      ...overrides,
    });

    it("fires for a high-risk open period on a streak worth protecting", () => {
      const [rec] = streakAtRisk(ctx({ streakRisks: [forecast()] }));
      expect(rec).toMatchObject({
        rule: "streak_at_risk",
        habitId: "1",
        dedupeKey: `streak_at_risk:1:${MON}`,
      });
      expect(rec.message).toContain('5-day streak on "Read" is at risk today');
      expect(rec.reason).toBe("Forecast: 72% chance of a miss. Rarely done on Mondays.");
    });

    it("stays quiet otherwise", () => {
      const quiet = [
        forecast({ riskLevel: "medium" }),
        forecast({ currentStreak: 2 }),
        forecast({ target: { period: "day", date: MON, current: false } }),
      ];
      expect(streakAtRisk(ctx({ streakRisks: quiet }))).toEqual([]);
      expect(streakAtRisk(ctx())).toEqual([]);
    });
  });

  it("evaluateRules returns unique dedupe keys", () => {
    const today = addDays(MON, 13);
    const keys = evaluateRules(
      ctx({ today, habits: [habit({}), habit({ id: "2", title: "Gym" })], lastCheckInDate: null })
    ).map((r) => r.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(0);
  });
});

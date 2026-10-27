const {
  buildPeriods,
  computeStreaks,
  streaksFor,
  statsFor,
  habitStartDate,
} = require("../../src/services/streak.service");

const daily = { frequency: "daily", targetDays: null };
const weekly = { frequency: "weekly", targetDays: null };
// Mon / Wed / Fri
const mwf = { frequency: "custom", targetDays: [1, 3, 5] };

// 2026-03-02 is a Monday.
const MON = "2026-03-02";

describe("streak service", () => {
  describe("daily habits", () => {
    it("counts consecutive completed days ending today", () => {
      const done = new Set(["2026-03-02", "2026-03-03", "2026-03-04"]);
      expect(streaksFor(daily, done, MON, "2026-03-04")).toEqual({
        currentStreak: 3,
        longestStreak: 3,
      });
    });

    it("does not break the current streak just because today isn't done yet", () => {
      const done = new Set(["2026-03-02", "2026-03-03"]);
      expect(streaksFor(daily, done, MON, "2026-03-04").currentStreak).toBe(2);
    });

    it("resets the current streak after a missed day but keeps the longest", () => {
      const done = new Set(["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-06"]);
      expect(streaksFor(daily, done, MON, "2026-03-06")).toEqual({
        currentStreak: 1,
        longestStreak: 3,
      });
    });

    it("is zero when yesterday was missed and today isn't done", () => {
      const done = new Set(["2026-03-02"]);
      expect(streaksFor(daily, done, MON, "2026-03-04").currentStreak).toBe(0);
    });
  });

  describe("custom (target days) habits", () => {
    it("only expects the scheduled weekdays, so off-days don't break streaks", () => {
      // Mon, Wed, Fri, next Mon all done; Tue/Thu/weekend are not scheduled
      const done = new Set(["2026-03-02", "2026-03-04", "2026-03-06", "2026-03-09"]);
      expect(streaksFor(mwf, done, MON, "2026-03-10")).toEqual({
        currentStreak: 4,
        longestStreak: 4,
      });
    });

    it("breaks the streak when a scheduled day is missed", () => {
      // Wed missed
      const done = new Set(["2026-03-02", "2026-03-06"]);
      expect(streaksFor(mwf, done, MON, "2026-03-07").currentStreak).toBe(1);
    });

    it("ignores completions logged on unscheduled days", () => {
      const periods = buildPeriods(mwf, new Set(["2026-03-03"]), MON, "2026-03-08", "2026-03-08");
      expect(periods.map((p) => p.key)).toEqual(["2026-03-02", "2026-03-04", "2026-03-06"]);
      expect(periods.every((p) => !p.completed)).toBe(true);
    });
  });

  describe("weekly habits", () => {
    it("counts consecutive weeks with at least one completion", () => {
      // one completion in each of three consecutive weeks
      const done = new Set(["2026-03-04", "2026-03-15", "2026-03-16"]);
      expect(streaksFor(weekly, done, MON, "2026-03-18")).toEqual({
        currentStreak: 3,
        longestStreak: 3,
      });
    });

    it("keeps the streak alive while the current week is still open", () => {
      const done = new Set(["2026-03-04", "2026-03-10"]);
      // Wednesday of week 3, nothing logged yet this week
      expect(streaksFor(weekly, done, MON, "2026-03-18").currentStreak).toBe(2);
    });
  });

  describe("computeStreaks", () => {
    it("returns zeros for no periods", () => {
      expect(computeStreaks([])).toEqual({ currentStreak: 0, longestStreak: 0 });
    });
  });

  describe("habitStartDate", () => {
    it("moves the start earlier when logs were backfilled before creation", () => {
      expect(habitStartDate("2026-03-10", new Set(["2026-03-05", "2026-03-12"]))).toBe(
        "2026-03-05"
      );
    });
  });

  describe("statsFor", () => {
    it("computes completion rate, leaving today out until it is done", () => {
      const done = new Set(["2026-03-02", "2026-03-04"]);
      const stats = statsFor(daily, done, MON, "2026-03-05");

      // Mon-Wed counted (Thu = today, pending): 2 of 3
      expect(stats).toMatchObject({ from: MON, to: "2026-03-05", scheduled: 3, completed: 2 });
      expect(stats.completionRate).toBeCloseTo(0.667, 3);
    });

    it("clips the range to the habit's history and to today", () => {
      const stats = statsFor(daily, new Set(), MON, "2026-03-05", {
        from: "2026-01-01",
        to: "2026-12-31",
      });
      expect(stats.from).toBe(MON);
      expect(stats.to).toBe("2026-03-05");
    });

    it("returns a null rate when nothing was scheduled", () => {
      const stats = statsFor(daily, new Set(), MON, MON);
      expect(stats).toMatchObject({ scheduled: 0, completionRate: null });
    });

    it("groups results per ISO week", () => {
      const done = new Set(["2026-03-02", "2026-03-09", "2026-03-10"]);
      const { weekly: weeks } = statsFor(daily, done, MON, "2026-03-16");

      expect(weeks).toEqual([
        { weekStart: "2026-03-02", scheduled: 7, completed: 1, rate: 0.143 },
        { weekStart: "2026-03-09", scheduled: 7, completed: 2, rate: 0.286 },
      ]);
    });
  });
});

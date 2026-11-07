const { openHabits, buildDailyReminder } = require("../../src/services/reminderContent");
const { addDays } = require("../../src/utils/dateUtils");

// 2026-03-02 is a Monday; 2026-03-08 is the Sunday of that week.
const MON = "2026-03-02";
const SUN = addDays(MON, 6);

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

function atRisk(overrides) {
  return {
    habitId: "1",
    title: "Read",
    currentStreak: 6,
    target: { period: "day", date: MON, current: true },
    riskLevel: "high",
    ...overrides,
  };
}

describe("daily reminder content", () => {
  it("lists only habits still open today", () => {
    const habits = [
      habit({ id: "1", title: "Read" }),
      habit({ id: "2", title: "Done", completedDates: new Set([MON]) }),
      habit({ id: "3", title: "Gym", frequency: "custom", targetDays: [2, 4] }), // not Mondays
      habit({ id: "4", title: "Family", frequency: "weekly" }),
    ];
    expect(openHabits(habits, MON).map((h) => h.id)).toEqual(["1"]);
  });

  it("brings up a weekly habit on Sunday if the week isn't done", () => {
    const pending = habit({ frequency: "weekly" });
    const done = habit({
      id: "2",
      frequency: "weekly",
      completedDates: new Set([addDays(MON, 2)]),
    });
    expect(openHabits([pending, done], SUN).map((h) => h.id)).toEqual(["1"]);
  });

  it("sends nothing when the day is already handled", () => {
    expect(
      buildDailyReminder({
        today: MON,
        habits: [habit({ completedDates: new Set([MON]) })],
        checkedInToday: true,
        streakRisks: [],
      })
    ).toBeNull();
  });

  it("names open habits and a missing check-in", () => {
    const habits = ["Read", "Gym", "Walk", "Stretch", "Journal"].map((title, i) =>
      habit({ id: String(i + 1), title })
    );
    const reminder = buildDailyReminder({
      today: MON,
      habits,
      checkedInToday: false,
      streakRisks: [],
    });

    expect(reminder.title).toBe("Your daily reminder");
    expect(reminder.message).toBe(
      '5 habits left today: "Read", "Gym", "Walk" and 2 more. You haven\'t done today\'s check-in yet.'
    );
    expect(reminder.data).toEqual({
      date: MON,
      habitIds: ["1", "2", "3", "4", "5"],
      atRiskHabitIds: [],
      checkInMissing: true,
    });
  });

  it("leads with a streak at risk", () => {
    const reminder = buildDailyReminder({
      today: MON,
      habits: [habit()],
      checkedInToday: true,
      streakRisks: [atRisk(), atRisk({ habitId: "2", riskLevel: "medium" })],
    });

    expect(reminder.title).toBe("A streak is at risk today");
    expect(reminder.message).toBe(
      '1 habit left today: "Read". Your 6-day streak on "Read" is at risk today.'
    );
    expect(reminder.data.atRiskHabitIds).toEqual(["1"]);
  });

  it("warns about an at-risk weekly streak before Sunday", () => {
    const weekly = atRisk({
      title: "Family",
      currentStreak: 4,
      target: { period: "week", date: MON, current: true },
    });
    const reminder = buildDailyReminder({
      today: addDays(MON, 3),
      habits: [habit({ frequency: "weekly", title: "Family" })],
      checkedInToday: true,
      streakRisks: [weekly],
    });
    expect(reminder.message).toBe('Your 4-week streak on "Family" is at risk this week.');
  });
});

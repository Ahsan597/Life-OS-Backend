/**
 * What the daily reminder says. Pure: no DB access.
 *
 * The reminder only nags about what is still open today:
 *   - daily/custom habits scheduled today and not done
 *   - weekly habits not done this week, on its last day (Sunday)
 *   - a missing check-in
 *   - streaks forecast as at risk (the `streak_at_risk` rule)
 * With nothing open there is no reminder at all.
 */
const { dayOfWeek, weekStart, addDays } = require("../utils/dateUtils");
const { isScheduledOn } = require("./streak.service");
const { isStreakAtRisk } = require("./recommendationRules");

const SUNDAY = 0;
const MAX_NAMED_HABITS = 3;

function doneThisWeek(habit, today) {
  const monday = weekStart(today);
  for (let day = monday; day <= today; day = addDays(day, 1)) {
    if (habit.completedDates.has(day)) return true;
  }
  return false;
}

/** Habits still expected today. */
function openHabits(habits, today) {
  return habits.filter((habit) => {
    if (habit.frequency === "weekly") {
      return dayOfWeek(today) === SUNDAY && !doneThisWeek(habit, today);
    }
    return isScheduledOn(habit, today) && !habit.completedDates.has(today);
  });
}

// "Read", "Read and Gym", "Read, Gym and Walk", "Read, Gym, Walk and 2 more"
function listTitles(titles) {
  const quoted = titles.map((t) => `"${t}"`);
  if (quoted.length <= 1) return quoted.join("");
  if (quoted.length <= MAX_NAMED_HABITS) {
    return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
  }
  const rest = quoted.length - MAX_NAMED_HABITS;
  return `${quoted.slice(0, MAX_NAMED_HABITS).join(", ")} and ${rest} more`;
}

/**
 * @param {{today: string, habits: object[], checkedInToday: boolean, streakRisks: object[]}} ctx
 *        habits as loaded by analyticsContext; streakRisks from streakRisk.service
 * @returns {{title: string, message: string, data: object} | null}
 */
function buildDailyReminder({ today, habits, checkedInToday, streakRisks }) {
  const open = openHabits(habits, today);
  const atRisk = streakRisks.filter(isStreakAtRisk);
  if (open.length === 0 && atRisk.length === 0 && checkedInToday) return null;

  const lines = [];
  if (open.length > 0) {
    const n = open.length;
    lines.push(
      `${n} habit${n === 1 ? "" : "s"} left today: ${listTitles(open.map((h) => h.title))}.`
    );
  }
  // Mostly habits already listed as open, so this adds urgency; a weekly
  // habit can also be at risk before its last day.
  for (const risk of atRisk) {
    const week = risk.target.period === "week";
    lines.push(
      `Your ${risk.currentStreak}-${week ? "week" : "day"} streak on "${risk.title}" is at risk ${week ? "this week" : "today"}.`
    );
  }
  if (!checkedInToday) {
    lines.push("You haven't done today's check-in yet.");
  }

  return {
    title: atRisk.length > 0 ? "A streak is at risk today" : "Your daily reminder",
    message: lines.join(" "),
    data: {
      date: today,
      habitIds: open.map((h) => h.id),
      atRiskHabitIds: atRisk.map((r) => r.habitId),
      checkInMissing: !checkedInToday,
    },
  };
}

module.exports = { openHabits, buildDailyReminder };

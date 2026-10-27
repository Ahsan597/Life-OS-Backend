/**
 * Loads the plain data the pure analytics modules (correlations, rules,
 * streak risk) work on, with every date already resolved in the user's
 * timezone. Shared by the insight and prediction services.
 */
const habitRepository = require("../repositories/habit.repository");
const checkInRepository = require("../repositories/checkIn.repository");
const { loadCompletedDates } = require("./habit.service");
const { habitStartDate } = require("./streak.service");
const { resolveLogicalDate, toDbDate, fromDbDate } = require("../utils/dateUtils");

/** Active habits with their completed days and the day their history starts. */
async function loadHabitContext(userId, timezone) {
  const habits = await habitRepository.findManyByUser(userId, { includeArchived: false });
  const completedByHabit = await loadCompletedDates(habits.map((h) => h.id));
  return habits.map((habit) => {
    const completedDates = completedByHabit.get(habit.id);
    return {
      id: habit.id.toString(),
      title: habit.title,
      frequency: habit.frequency,
      targetDays: habit.targetDays,
      start: habitStartDate(resolveLogicalDate(habit.createdAt, timezone), completedDates),
      completedDates,
    };
  });
}

async function loadCheckIns(userId, from, to) {
  if (from > to) return [];
  const rows = await checkInRepository.findManyInRange(userId, toDbDate(from), toDbDate(to));
  return rows.map((c) => ({
    date: fromDbDate(c.checkInDate),
    mood: c.mood,
    energy: c.energy,
    sleepHours: c.sleepHours === null ? null : Number(c.sleepHours),
    stressLevel: c.stressLevel,
  }));
}

module.exports = { loadHabitContext, loadCheckIns };

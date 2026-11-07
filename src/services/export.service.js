/**
 * "Download my data": everything the user entered, as one JSON document or
 * one CSV per dataset. Derived data that can be recomputed (correlations,
 * forecasts, notifications) is left out; recommendations are included
 * because the user's accept/dismiss decisions are their own data.
 */
const habitRepository = require("../repositories/habit.repository");
const habitLogRepository = require("../repositories/habitLog.repository");
const checkInRepository = require("../repositories/checkIn.repository");
const recommendationRepository = require("../repositories/recommendation.repository");
const userService = require("./user.service");
const { toPublicHabit, toPublicLog } = require("./habit.service");
const { toPublicCheckIn } = require("./checkIn.service");
const { toPublicRecommendation } = require("./insight.service");
const { toCsv } = require("../utils/csv");
const { getTodayForUser } = require("../utils/dateUtils");

// Bump when the JSON shape changes incompatibly, so importers can tell.
const FORMAT_VERSION = 1;

const DATASETS = {
  habits: {
    load: async (userId) =>
      (await habitRepository.findManyByUser(userId, { includeArchived: true })).map(toPublicHabit),
    columns: [
      "id",
      "title",
      "description",
      "frequency",
      "targetDays",
      "isActive",
      "createdAt",
      "updatedAt",
    ],
  },
  habit_logs: {
    load: async (userId) => (await habitLogRepository.findAllForUser(userId)).map(toPublicLog),
    columns: ["id", "habitId", "date", "completed", "note", "createdAt"],
  },
  check_ins: {
    load: async (userId) => (await checkInRepository.findAllForUser(userId)).map(toPublicCheckIn),
    columns: ["id", "date", "mood", "energy", "sleepHours", "stressLevel", "note", "createdAt"],
  },
  recommendations: {
    load: async (userId) =>
      (await recommendationRepository.findManyByUser(userId)).map(toPublicRecommendation),
    columns: [
      "id",
      "rule",
      "habitId",
      "habitTitle",
      "message",
      "reason",
      "status",
      "createdAt",
      "updatedAt",
    ],
  },
};

const DATASET_NAMES = Object.keys(DATASETS);

/** @returns {{filename: string, contentType: string, body: string}} */
async function exportData(userId, { format, dataset }) {
  const user = await userService.getProfile(userId);
  const today = getTodayForUser(user.timezone);

  if (format === "csv") {
    const { load, columns } = DATASETS[dataset];
    return {
      filename: `lifeos-${dataset.replace("_", "-")}-${today}.csv`,
      contentType: "text/csv; charset=utf-8",
      body: toCsv(columns, await load(user.id)),
    };
  }

  const [habits, habitLogs, checkIns, recommendations] = await Promise.all(
    DATASET_NAMES.map((name) => DATASETS[name].load(user.id))
  );
  return {
    filename: `lifeos-export-${today}.json`,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(
      {
        formatVersion: FORMAT_VERSION,
        exportedAt: new Date(),
        user,
        habits,
        habitLogs,
        checkIns,
        recommendations,
      },
      null,
      2
    ),
  };
}

module.exports = { DATASET_NAMES, exportData };

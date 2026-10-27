const checkInRepository = require("../repositories/checkIn.repository");
const userService = require("./user.service");
const { METRICS } = require("../validators/checkIn.validators");
const AppError = require("../utils/AppError");
const { mean, round, slope: leastSquaresSlope } = require("../utils/stats");
const { getTodayForUser, toDbDate, fromDbDate, addDays, diffDays } = require("../utils/dateUtils");

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
// A slope smaller than this per day is reported as "flat".
const FLAT_SLOPE = 0.01;

function toPublicCheckIn(checkIn) {
  return {
    id: checkIn.id.toString(),
    date: fromDbDate(checkIn.checkInDate),
    mood: checkIn.mood,
    energy: checkIn.energy,
    // Prisma returns DECIMAL as a Decimal object
    sleepHours: checkIn.sleepHours === null ? null : Number(checkIn.sleepHours),
    stressLevel: checkIn.stressLevel,
    note: checkIn.note,
    createdAt: checkIn.createdAt,
  };
}

/**
 * Resolves an optional from/to pair: `to` defaults to today, `from` to
 * `defaultDays` (30) days ending at `to`. Ranges are capped so one request
 * can't pull years of rows.
 */
function resolveRange({ from, to }, today, defaultDays = DEFAULT_RANGE_DAYS) {
  const rangeTo = to || today;
  const rangeFrom = from || addDays(rangeTo, -(defaultDays - 1));
  if (rangeFrom > rangeTo) {
    throw new AppError("'from' must be on or before 'to'", 400);
  }
  if (diffDays(rangeFrom, rangeTo) + 1 > MAX_RANGE_DAYS) {
    throw new AppError(`Date range cannot exceed ${MAX_RANGE_DAYS} days`, 400);
  }
  return { from: rangeFrom, to: rangeTo };
}

/**
 * Saves the check-in for a day (default: today in the user's timezone).
 * One check-in per day: posting again for the same day updates it. Fields
 * left out keep their previous value; send null to clear one.
 */
async function saveCheckIn(userId, { date, ...fields }) {
  const timezone = await userService.getTimezone(userId);
  const today = getTodayForUser(timezone);
  const day = date || today;
  if (day > today) {
    throw new AppError("Cannot check in for a future date", 400);
  }

  const dbDate = toDbDate(day);
  const existing = await checkInRepository.findByUserAndDate(userId, dbDate);
  const checkIn = await checkInRepository.upsert(userId, dbDate, fields);

  return { checkIn: toPublicCheckIn(checkIn), created: !existing };
}

async function listCheckIns(userId, query) {
  const timezone = await userService.getTimezone(userId);
  const { from, to } = resolveRange(query, getTodayForUser(timezone));
  const checkIns = await checkInRepository.findManyInRange(userId, toDbDate(from), toDbDate(to));
  return { from, to, checkIns: checkIns.map(toPublicCheckIn) };
}

async function getCheckInByDate(userId, date) {
  const checkIn = await checkInRepository.findByUserAndDate(userId, toDbDate(date));
  if (!checkIn) {
    throw new AppError("No check-in for this date", 404);
  }
  return toPublicCheckIn(checkIn);
}

function summarizeMetric(series, metric, from) {
  const points = series
    .filter((c) => c[metric] !== null)
    .map((c) => ({ x: diffDays(from, c.date), y: c[metric] }));

  if (points.length === 0) {
    return { count: 0, average: null, min: null, max: null, slopePerDay: null, trend: null };
  }

  const values = points.map((p) => p.y);
  const slope = leastSquaresSlope(points);
  let trend = null;
  if (slope !== null) {
    trend = Math.abs(slope) < FLAT_SLOPE ? "flat" : slope > 0 ? "rising" : "falling";
  }

  return {
    count: points.length,
    average: round(mean(values)),
    min: Math.min(...values),
    max: Math.max(...values),
    slopePerDay: slope === null ? null : round(slope, 3),
    trend,
  };
}

/**
 * Per-metric averages and trend direction over a date range, plus the raw
 * daily series for trend-line charts.
 */
async function getCheckInStats(userId, query) {
  const { from, to, checkIns } = await listCheckIns(userId, query);
  const series = checkIns.map(({ date, mood, energy, sleepHours, stressLevel }) => ({
    date,
    mood,
    energy,
    sleepHours,
    stressLevel,
  }));

  return {
    from,
    to,
    daysInRange: diffDays(from, to) + 1,
    daysCheckedIn: series.length,
    metrics: Object.fromEntries(METRICS.map((m) => [m, summarizeMetric(series, m, from)])),
    series,
  };
}

module.exports = {
  resolveRange,
  saveCheckIn,
  listCheckIns,
  getCheckInByDate,
  getCheckInStats,
};

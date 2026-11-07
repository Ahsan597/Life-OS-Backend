const userRepository = require("../repositories/user.repository");
const AppError = require("../utils/AppError");

function toPublicUser(user) {
  return {
    id: user.id.toString(),
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    createdAt: user.createdAt,
    preferences: {
      remindersEnabled: user.remindersEnabled,
      reminderTime: user.reminderTime,
      emailReminders: user.emailReminders,
    },
  };
}

async function getUser(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    // Valid token, but the account is gone.
    throw new AppError("User not found", 401);
  }
  return user;
}

// The user's IANA timezone drives every "which day is it" decision.
async function getTimezone(userId) {
  const user = await getUser(userId);
  return user.timezone;
}

async function getProfile(userId) {
  return toPublicUser(await getUser(userId));
}

/**
 * Profile (name, timezone) and notification preferences share one update.
 * Changing the timezone only affects dates resolved from now on: existing
 * logs and check-ins keep the day they were saved under.
 */
async function updateProfile(userId, { preferences = {}, ...profile }) {
  await getUser(userId);
  const user = await userRepository.update(userId, { ...profile, ...preferences });
  return toPublicUser(user);
}

module.exports = { toPublicUser, getUser, getTimezone, getProfile, updateProfile };

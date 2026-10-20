const userRepository = require("../repositories/user.repository");
const AppError = require("../utils/AppError");

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

module.exports = { getUser, getTimezone };

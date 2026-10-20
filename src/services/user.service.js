const userRepository = require("../repositories/user.repository");
const AppError = require("../utils/AppError");

// The user's IANA timezone drives every "which day is it" decision.
async function getTimezone(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    // Valid token, but the account is gone.
    throw new AppError("User not found", 401);
  }
  return user.timezone;
}

module.exports = { getTimezone };

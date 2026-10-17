const bcrypt = require("bcrypt");
const userRepository = require("../repositories/user.repository");
const refreshTokenRepository = require("../repositories/refreshToken.repository");
const tokenService = require("./token.service");
const AppError = require("../utils/AppError");

const BCRYPT_ROUNDS = 12;
// Compared against when the email doesn't exist, so login takes the same time
// either way and doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_ROUNDS);

function toPublicUser(user) {
  return {
    id: user.id.toString(),
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    createdAt: user.createdAt,
  };
}

async function issueTokens(userId) {
  const accessToken = tokenService.signAccessToken(userId);
  const refreshToken = tokenService.signRefreshToken(userId);
  const { exp } = tokenService.verifyRefreshToken(refreshToken);

  await refreshTokenRepository.create({
    userId,
    tokenHash: tokenService.hashToken(refreshToken),
    expiresAt: new Date(exp * 1000),
  });

  return { accessToken, refreshToken };
}

async function register({ email, password, name, timezone }) {
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new AppError("Email is already registered", 409);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await userRepository.create({ email, passwordHash, name, timezone });
  const tokens = await issueTokens(user.id);

  return { user: toPublicUser(user), ...tokens };
}

async function login({ email, password }) {
  const user = await userRepository.findByEmail(email);
  const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !passwordOk) {
    throw new AppError("Invalid email or password", 401);
  }

  const tokens = await issueTokens(user.id);
  return { user: toPublicUser(user), ...tokens };
}

/**
 * Rotates a refresh token: the old one is revoked and a new pair is issued.
 * If an already-revoked token is presented, it was likely stolen and replayed,
 * so every session for that user is revoked.
 */
async function refresh(refreshToken) {
  let payload;
  try {
    payload = tokenService.verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const stored = await refreshTokenRepository.findByHash(tokenService.hashToken(refreshToken));
  if (!stored || stored.userId.toString() !== payload.sub) {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  if (stored.revokedAt) {
    await refreshTokenRepository.revokeAllForUser(stored.userId);
    throw new AppError("Refresh token has been revoked", 401);
  }

  await refreshTokenRepository.revoke(stored.id);
  return issueTokens(stored.userId);
}

// Idempotent: logging out with an unknown or already-revoked token still succeeds.
async function logout(refreshToken) {
  const stored = await refreshTokenRepository.findByHash(tokenService.hashToken(refreshToken));
  if (stored && !stored.revokedAt) {
    await refreshTokenRepository.revoke(stored.id);
  }
}

async function getCurrentUser(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }
  return toPublicUser(user);
}

module.exports = { register, login, refresh, logout, getCurrentUser };

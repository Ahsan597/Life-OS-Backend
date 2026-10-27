const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

function signAccessToken(userId) {
  return jwt.sign({ sub: userId.toString() }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });
}

// jwtid makes every refresh token unique, even two issued in the same second.
function signRefreshToken(userId) {
  return jwt.sign({ sub: userId.toString() }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
    jwtid: crypto.randomUUID(),
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

// Refresh tokens are stored hashed so a DB leak doesn't hand out live sessions.
// SHA-256 (not bcrypt) because we need a deterministic hash to look tokens up by.
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
};

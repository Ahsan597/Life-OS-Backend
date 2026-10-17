const prisma = require("../config/prisma");

function create({ userId, tokenHash, expiresAt }) {
  return prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
}

function findByHash(tokenHash) {
  return prisma.refreshToken.findFirst({ where: { tokenHash } });
}

function revoke(id) {
  return prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

function revokeAllForUser(userId) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

module.exports = { create, findByHash, revoke, revokeAllForUser };

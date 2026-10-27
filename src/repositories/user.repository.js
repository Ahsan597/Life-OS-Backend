const prisma = require("../config/prisma");

function findByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

function findById(id) {
  return prisma.user.findUnique({ where: { id } });
}

function create(data) {
  return prisma.user.create({ data });
}

module.exports = { findByEmail, findById, create };

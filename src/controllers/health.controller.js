const prisma = require("../config/prisma");

async function getHealth(req, res) {
  await prisma.$queryRaw`SELECT 1`;
  res.status(200).json({ status: "ok", database: "connected" });
}

module.exports = { getHealth };

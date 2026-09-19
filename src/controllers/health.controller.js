const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");

const getHealth = asyncHandler(async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.status(200).json({ status: "ok", database: "connected" });
});

module.exports = { getHealth };

const checkInService = require("../services/checkIn.service");

async function save(req, res) {
  const { checkIn, created } = await checkInService.saveCheckIn(req.user.id, req.body);
  res.status(created ? 201 : 200).json({ checkIn });
}

async function list(req, res) {
  const result = await checkInService.listCheckIns(req.user.id, req.query);
  res.status(200).json(result);
}

async function getByDate(req, res) {
  const checkIn = await checkInService.getCheckInByDate(req.user.id, req.params.date);
  res.status(200).json({ checkIn });
}

async function stats(req, res) {
  const stats = await checkInService.getCheckInStats(req.user.id, req.query);
  res.status(200).json({ stats });
}

module.exports = { save, list, getByDate, stats };

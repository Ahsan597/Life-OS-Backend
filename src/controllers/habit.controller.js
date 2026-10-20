const habitService = require("../services/habit.service");

// Express 5 forwards rejected promises from async handlers to the error
// handler, so no try/catch or asyncHandler wrapper is needed.

async function create(req, res) {
  const habit = await habitService.createHabit(req.user.id, req.body);
  res.status(201).json({ habit });
}

async function list(req, res) {
  const habits = await habitService.listHabits(req.user.id, req.query);
  res.status(200).json({ habits });
}

async function getById(req, res) {
  const habit = await habitService.getHabit(req.user.id, req.params.id);
  res.status(200).json({ habit });
}

async function update(req, res) {
  const habit = await habitService.updateHabit(req.user.id, req.params.id, req.body);
  res.status(200).json({ habit });
}

async function remove(req, res) {
  await habitService.archiveHabit(req.user.id, req.params.id);
  res.status(204).end();
}

async function createLog(req, res) {
  const { log, created } = await habitService.logHabit(req.user.id, req.params.id, req.body);
  res.status(created ? 201 : 200).json({ log });
}

async function listLogs(req, res) {
  const logs = await habitService.listLogs(req.user.id, req.params.id, req.query);
  res.status(200).json({ logs });
}

async function updateLog(req, res) {
  const log = await habitService.updateLog(req.user.id, req.params.id, req.body);
  res.status(200).json({ log });
}

async function stats(req, res) {
  const stats = await habitService.getHabitStats(req.user.id, req.params.id, req.query);
  res.status(200).json({ stats });
}

module.exports = { create, list, getById, update, remove, createLog, listLogs, updateLog, stats };

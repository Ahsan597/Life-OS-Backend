const authService = require("../services/auth.service");

async function register(req, res) {
  const result = await authService.register(req.body);
  res.status(201).json(result);
}

async function login(req, res) {
  const result = await authService.login(req.body);
  res.status(200).json(result);
}

async function refresh(req, res) {
  const tokens = await authService.refresh(req.body.refreshToken);
  res.status(200).json(tokens);
}

async function logout(req, res) {
  await authService.logout(req.body.refreshToken);
  res.status(204).end();
}

async function me(req, res) {
  const user = await authService.getCurrentUser(req.user.id);
  res.status(200).json({ user });
}

module.exports = { register, login, refresh, logout, me };

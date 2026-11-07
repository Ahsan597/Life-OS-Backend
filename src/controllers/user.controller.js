const userService = require("../services/user.service");

async function getMe(req, res) {
  const user = await userService.getProfile(req.user.id);
  res.status(200).json({ user });
}

async function updateMe(req, res) {
  const user = await userService.updateProfile(req.user.id, req.body);
  res.status(200).json({ user });
}

module.exports = { getMe, updateMe };

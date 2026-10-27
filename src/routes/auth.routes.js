const express = require("express");
const authController = require("../controllers/auth.controller");
const validateRequest = require("../middlewares/validateRequest");
const authGuard = require("../middlewares/authGuard");
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} = require("../validators/auth.validators");

const router = express.Router();

router.post("/register", validateRequest(registerSchema), authController.register);
router.post("/login", validateRequest(loginSchema), authController.login);
router.post("/refresh", validateRequest(refreshTokenSchema), authController.refresh);
router.post("/logout", validateRequest(refreshTokenSchema), authController.logout);
router.get("/me", authGuard, authController.me);

module.exports = router;

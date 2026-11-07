const express = require("express");
const userController = require("../controllers/user.controller");
const validateRequest = require("../middlewares/validateRequest");
const authGuard = require("../middlewares/authGuard");
const { updateProfileSchema } = require("../validators/user.validators");

const router = express.Router();

router.use(authGuard);

router.get("/me", userController.getMe);
router.patch("/me", validateRequest(updateProfileSchema), userController.updateMe);

module.exports = router;

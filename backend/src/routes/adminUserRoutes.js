const express = require("express");
const adminAuth = require("../middleware/adminAuth");

const {
    getUsers,
    getUserById,
    updateUserStatus,
} = require("../controllers/adminUserController");

const router = express.Router();

router.use(adminAuth);

router.get("/", getUsers);
router.get("/:id", getUserById);
router.patch("/:id/status", updateUserStatus);

module.exports = router;
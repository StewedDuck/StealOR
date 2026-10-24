const express = require("express");
const {
    syncUser,
    getProfile,
    updateProfile,
} = require("../controllers/userController");

const profileAuth = require("../middleware/profileAuth");

const router = express.Router();

router.post("/sync", profileAuth, syncUser);

router.get("/profile/:email", profileAuth, getProfile);

router.patch("/profile/:email", profileAuth, updateProfile);

module.exports = router;
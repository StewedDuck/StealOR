const express = require("express");
const {
    syncUser,
    getProfile,
    updateProfile,
} = require("../controllers/userController");

const profileAuth = require("../middleware/profileAuth");

const router = express.Router();

router.post("/sync", profileAuth, syncUser);

// profileAuth checks the current database status on every request.
router.get("/status", profileAuth, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ success: true });
});

router.get("/profile/:email", profileAuth, getProfile);

router.patch("/profile/:email", profileAuth, updateProfile);

module.exports = router;
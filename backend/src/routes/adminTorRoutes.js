const express = require("express");
const adminAuth = require("../middleware/adminAuth");
const Tor = require("../models/Tor");

const router = express.Router();
router.use(adminAuth);

// Admin reads the same TOR records used by project owners, across all owners.
router.get("/", async (req, res) => {
    try {
        const tors = await Tor.find({}).sort({ updatedAt: -1 }).lean();
        return res.json({ success: true, data: tors });
    } catch (error) {
        console.error("Admin TOR list error:", error);
        return res.status(500).json({ success: false, error: "ไม่สามารถโหลดข้อมูล TOR ได้" });
    }
});

module.exports = router;

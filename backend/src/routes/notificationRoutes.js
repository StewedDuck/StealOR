const express = require("express");

const {
    getNotifications,
    markNotificationAsRead,
} = require("../controllers/notificationController");

const router = express.Router();
router.use(require("../middleware/profileAuth"));

router.get("/preferences", require("../controllers/notificationController").getPreferences);
router.patch("/preferences", require("../controllers/notificationController").updatePreferences);
router.get("/", getNotifications);

router.patch(
    "/:id/read",
    markNotificationAsRead
);

module.exports = router;
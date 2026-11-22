const router = require("express").Router();
const adminAuth = require("../middleware/adminAuth");
const adminRssController = require("../controllers/adminRssController");

router.get("/", adminAuth, adminRssController.getDepartments);
router.post("/", adminAuth, adminRssController.addDepartment);
router.patch("/:id", adminAuth, adminRssController.updateDepartment);
router.delete("/:id", adminAuth, adminRssController.deleteDepartment);
router.post("/sync-now", adminAuth, adminRssController.triggerSyncNow);

module.exports = router;
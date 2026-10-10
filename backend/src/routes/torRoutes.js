const express = require("express");

const {
  createTor,
  getTors,
  getTorById,
  updateTor,
  deleteTor,
  getMarketTors,
  getMarketTorDetail,
  publishTor,
} = require("../controllers/torController");

const torOwnerAuth = require("../middleware/torOwnerAuth");

const router = express.Router();

// Public: Contractor Market
router.get("/market", getMarketTors);
router.get("/market/:projectId", getMarketTorDetail);

// Private: Project Owner
router.use(torOwnerAuth);

router.post("/", createTor);
router.get("/", getTors);
router.get("/:id", getTorById);
router.patch("/:id/publish", publishTor);
router.patch("/:id", updateTor);
router.delete("/:id", deleteTor);

module.exports = router;
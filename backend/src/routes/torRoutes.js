const express = require("express");
const { createTor, getTors, getTorById, updateTor, deleteTor, getMarketTors, getMarketTorDetail } = require("../controllers/torController");

const router = express.Router();
router.post("/", createTor);
router.get("/", getTors);

router.get("/market", getMarketTors);
router.get("/market/:projectId", getMarketTorDetail);

router.get("/:id", getTorById);
router.patch("/:id", updateTor);
router.delete("/:id", deleteTor);

module.exports = router;

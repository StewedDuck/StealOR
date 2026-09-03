const express = require("express");
const { createTor, getTors, getTorById, updateTor, deleteTor } = require("../controllers/torController");

const router = express.Router();
router.post("/", createTor);
router.get("/", getTors);
router.get("/:id", getTorById);
router.patch("/:id", updateTor);
router.delete("/:id", deleteTor);

module.exports = router;

const checkActiveAccount = require("../middleware/activeAccount").fromRequest;
const express = require("express");

const { getComments, createComment, deleteComment } = require("../controllers/commentController");
const router = express.Router();

router.get("/:projectId", checkActiveAccount, getComments);
router.post("/", require("../middleware/profileAuth"), createComment);
router.delete("/:commentId", require("../middleware/profileAuth"), deleteComment);

module.exports = router;

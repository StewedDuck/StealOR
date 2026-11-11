const checkActiveAccount = require("../middleware/activeAccount").fromRequest;
const express = require("express");

const { getComments, createComment, deleteComment } = require("../controllers/commentController");
const router = express.Router();

router.get("/:projectId", checkActiveAccount, getComments);
router.post("/", checkActiveAccount, createComment);
router.delete("/:commentId", checkActiveAccount, deleteComment);

module.exports = router;

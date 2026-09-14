const express = require("express");

const { getComments, createComment, deleteComment } = require("../controllers/commentController");
const router = express.Router();

router.get("/:projectId", getComments);
router.post("/", createComment);
router.delete("/:commentId", deleteComment);

module.exports = router;

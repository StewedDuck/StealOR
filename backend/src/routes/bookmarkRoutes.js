const express = require("express")

const {
    createBookmark,
    getBookmarks,
    deleteBookmark,
} = require("../controllers/bookmarkController")

const router = express.Router();

router.post("/", createBookmark);
router.get("/", getBookmarks);
router.delete("/:userId/:projectId", deleteBookmark);

module.exports = router;
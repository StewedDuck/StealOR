const express = require("express")

const {
    createBookmark,
    getBookmarks,
    deleteBookmark,
    deleteInternalBookmark,
} = require("../controllers/bookmarkController")

const router = express.Router();

router.post("/", createBookmark);
router.get("/", getBookmarks);
router.delete("/:userId/:projectId", deleteBookmark);
router.delete("/internal/:userId/:torId", deleteInternalBookmark);

module.exports = router;
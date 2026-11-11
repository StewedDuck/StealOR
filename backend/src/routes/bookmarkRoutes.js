const checkActiveAccount = require("../middleware/activeAccount").fromRequest;
const express = require("express")

const {
    createBookmark,
    getBookmarks,
    deleteBookmark,
    deleteInternalBookmark,
} = require("../controllers/bookmarkController")

const router = express.Router();

router.post("/", checkActiveAccount, createBookmark);
router.get("/", checkActiveAccount, getBookmarks);
router.delete("/:userId/:projectId", checkActiveAccount, deleteBookmark);
router.delete("/internal/:userId/:torId", checkActiveAccount, deleteInternalBookmark);

module.exports = router;
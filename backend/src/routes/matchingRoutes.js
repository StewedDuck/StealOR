const express = require("express");

const profileAuth = require("../middleware/profileAuth");

const {
    getTorMatching,
    getMatchedTors,
} = require("../controllers/matchingController");

const router = express.Router();

router.get('/dashboard', profileAuth, require('../controllers/contractorDashboardController').getContractorDashboard);

// Private: list TORs that meet the relevance threshold.
router.get(
    "/",
    profileAuth,
    getMatchedTors
);

// Private: matching details for one TOR.
router.get(
    "/:torSource/:torId",
    profileAuth,
    getTorMatching
);

module.exports = router;
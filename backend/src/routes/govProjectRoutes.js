const express = require("express");
const { enrichProject } = require("../controllers/govProjectController");

const router = express.Router();

router.post("/:projectId/enrich", enrichProject);

module.exports = router;

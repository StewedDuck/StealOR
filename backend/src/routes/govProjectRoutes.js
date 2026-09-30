const express = require("express");
const {
  enrichProject,
  importEnrichedProjects,
} = require("../controllers/govProjectController");

const router = express.Router();

router.post("/import-enriched", importEnrichedProjects);
router.post("/:projectId/enrich", enrichProject);

module.exports = router;

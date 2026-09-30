const express = require("express");
const {
  downloadOriginalDocument,
  enrichProject,
  importEnrichedProjects,
} = require("../controllers/govProjectController");

const router = express.Router();

router.post("/import-enriched", importEnrichedProjects);
router.get("/:projectId/document/download", downloadOriginalDocument);
router.post("/:projectId/enrich", enrichProject);

module.exports = router;

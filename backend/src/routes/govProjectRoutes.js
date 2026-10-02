const express = require("express");
const {
  downloadDraftEbiddingDocument,
  downloadInvitationDocument,
  downloadOriginalDocument,
  enrichProject,
  importEnrichedProjects,
} = require("../controllers/govProjectController");

const router = express.Router();

router.post("/import-enriched", importEnrichedProjects);
router.get("/:projectId/document/download", downloadOriginalDocument);
router.get(
  "/:projectId/documents/invitation/download",
  downloadInvitationDocument
);
router.get(
  "/:projectId/documents/draft-ebidding/download",
  downloadDraftEbiddingDocument
);
router.post("/:projectId/enrich", enrichProject);

module.exports = router;

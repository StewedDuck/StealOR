const express = require("express");
const {
  downloadDraftEbiddingDocument,
  downloadInvitationDocument,
  downloadOriginalDocument,
  enrichProject,
  importEnrichedProjects,
  listLocalProjectDocuments,
  viewLocalProjectDocument,
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
router.get("/:projectId/documents/local", listLocalProjectDocuments);
router.get("/:projectId/documents/local/:category/:fileName", viewLocalProjectDocument);
router.post("/:projectId/enrich", enrichProject);

module.exports = router;

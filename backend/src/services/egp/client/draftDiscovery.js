const { DOCUMENT_CATEGORY, LOOKUP_METHOD } = require("./constants");
const { ERROR_KIND, EgpServiceError } = require("./errors");
const { getDraftEbiddingMetadata } = require("./process5Draft");
const { getLegacyDraftEbiddingMetadata } = require("./legacyDraft");
const { createNotFoundMetadata } = require("./metadata");
const {
  getDraftCategoryState,
  getPublicAnnouncementDocumentList,
} = require("./publicAnnouncement");

async function discoverDraftEbiddingMetadata(projectId, options) {
  let publicDocuments;
  try {
    publicDocuments = await getPublicAnnouncementDocumentList(
      projectId,
      options
    );
  } catch (error) {
    if (error?.code !== "EGP_INVITATION_CATEGORY_UNVERIFIED") throw error;
    throw new EgpServiceError(
      "e-GP did not provide complete Draft category evidence",
      502,
      {
        code: "EGP_DRAFT_CATEGORY_UNVERIFIED",
        kind: ERROR_KIND.RECOVERABLE,
        details: { causeCode: error.code },
      }
    );
  }
  if (getDraftCategoryState(publicDocuments) === "not_found") {
    return createNotFoundMetadata(
      projectId,
      DOCUMENT_CATEGORY.DRAFT_EBIDDING,
      LOOKUP_METHOD.DRAFT_PUBLIC_CATEGORY
    );
  }

  const process5 = await getDraftEbiddingMetadata(projectId, options);
  if (process5.status !== "not_found") return process5;

  const attempts = [...(process5.lookupAttempts || [])];
  try {
    const legacy = await getLegacyDraftEbiddingMetadata(projectId, options);
    attempts.push({
      lookupMethod: LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC,
      outcome: legacy.status,
    });
    return { ...legacy, lookupAttempts: attempts };
  } catch (error) {
    attempts.push({
      lookupMethod: LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC,
      outcome: "error",
      code: error.code || "EGP_SERVICE_ERROR",
      kind: error.kind || ERROR_KIND.RECOVERABLE,
    });
    error.details = { ...error.details, lookupAttempts: attempts };
    throw error;
  }
}

module.exports = {
  discoverDraftEbiddingMetadata,
};

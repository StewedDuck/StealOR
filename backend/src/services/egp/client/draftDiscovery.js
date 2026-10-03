const { LOOKUP_METHOD } = require("./constants");
const { ERROR_KIND } = require("./errors");
const { getDraftEbiddingMetadata } = require("./process5Draft");
const { getLegacyDraftEbiddingMetadata } = require("./legacyDraft");

async function discoverDraftEbiddingMetadata(projectId, options) {
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

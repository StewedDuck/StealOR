const {
  EGP_BASE_URL,
  DOCUMENT_CATEGORY,
  LOOKUP_METHOD,
  DOWNLOAD_METHOD,
} = require("./client/constants");
const {
  ERROR_KIND,
  EgpServiceError,
} = require("./client/errors");
const {
  validateProjectId,
} = require("./client/validation");
const {
  discoverPriceEstimateMetadata,
} = require("./client/priceEstimate");
const {
  getInvitationBiddingDocumentMetadata,
} = require("./client/invitation");
const {
  discoverDraftEbiddingMetadata,
} = require("./client/draftDiscovery");
const {
  isStaleDocumentReferenceError,
  downloadZip,
  downloadLegacyZip,
  downloadLegacyDraftZip,
} = require("./client/downloads");

function createNationalEgpAdapter(defaultOptions = {}) {
  return {
    // Discover only metadata here. Downloading is deliberately separate so
    // callers can cache the reference without fetching a large ZIP archive.
    discoverPriceEstimate(projectId, options = {}) {
      return discoverPriceEstimateMetadata(projectId, {
        ...defaultOptions,
        ...options,
      });
    },

    discoverInvitation(projectId, options = {}) {
      const safeProjectId = validateProjectId(projectId);
      return getInvitationBiddingDocumentMetadata(safeProjectId, {
        ...defaultOptions,
        ...options,
      });
    },

    discoverDraftEbidding(projectId, options = {}) {
      const safeProjectId = validateProjectId(projectId);
      return discoverDraftEbiddingMetadata(safeProjectId, {
        ...defaultOptions,
        ...options,
      });
    },

    // Choose the upstream download mechanism inside the adapter. Services and
    // controllers therefore do not need to understand the Process 3 fallback.
    downloadDocument(metadata, options = {}) {
      const requestOptions = { ...defaultOptions, ...options };
      if (
        metadata?.downloadMethod === DOWNLOAD_METHOD.LEGACY_DRAFT_TRANSFER
      ) {
        return downloadLegacyDraftZip(metadata, requestOptions);
      }
      if (metadata?.downloadMethod === DOWNLOAD_METHOD.LEGACY_FILENAME) {
        return downloadLegacyZip(
          metadata.projectId,
          metadata.fileName,
          requestOptions
        );
      }
      return downloadZip(metadata?.fileId, requestOptions);
    },

    // A stored locator is rediscovered only for evidence of staleness or a
    // wrong file, never for access-denied or rate-limit responses.
    shouldRediscoverAfterDownloadError(error) {
      return isStaleDocumentReferenceError(error);
    },
  };
}

const nationalEgpAdapter = createNationalEgpAdapter();

// Compatibility wrapper retained for current services and tests while the
// application is migrated incrementally to the adapter interface.
function getPriceEstimateMetadata(projectId, options = {}) {
  return nationalEgpAdapter.discoverPriceEstimate(projectId, options);
}

module.exports = {
  DOCUMENT_CATEGORY,
  LOOKUP_METHOD,
  DOWNLOAD_METHOD,
  ERROR_KIND,
  EGP_BASE_URL,
  EgpServiceError,
  validateProjectId,
  createNationalEgpAdapter,
  nationalEgpAdapter,
  getPriceEstimateMetadata,
  downloadZip,
  downloadLegacyDraftZip,
  downloadLegacyZip,
};

const {
  EGP_BASE_URL,
  EGP_LEGACY_BASE_URL,
  EGP_LEGACY_FILE_BASE_URL,
  DOCUMENT_CATEGORY,
  DOWNLOAD_METHOD,
  LEGACY_DRAFT_TRANSFER_PATH,
} = require("./constants");

// Convert every upstream response into one application-owned shape. Code outside
// this adapter must not depend on e-GP field names such as zipFileId or priceBuildName.
function createDocumentMetadata({
  projectId,
  category = DOCUMENT_CATEGORY.PRICE_ESTIMATE,
  fileId = null,
  fileName,
  lookupMethod,
  downloadMethod = DOWNLOAD_METHOD.FILE_ID,
  additionalFields = {},
}) {
  const metadata = {
    projectId,
    category,
    status: "available",
    source: "national_egp",
    lookupMethod,
    downloadMethod,
    fileId,
    fileName: String(fileName || `${projectId}.zip`),
    ...additionalFields,
  };
  return { ...metadata, downloadUrl: buildDocumentDownloadUrl(metadata) };
}

/**
 * Represent confirmed document absence using the same metadata shape as successful discovery.
 */
function createNotFoundMetadata(projectId, category, lookupMethod) {
  return {
    projectId,
    category,
    status: "not_found",
    source: "national_egp",
    lookupMethod,
    downloadMethod: DOWNLOAD_METHOD.FILE_ID,
    fileId: null,
    fileName: null,
    downloadUrl: null,
  };
}

/**
 * Return candidate diagnostics without selecting a draft when discovery cannot identify one safely.
 */
function createAmbiguousMetadata(projectId, candidates, details = {}) {
  return {
    projectId,
    category: DOCUMENT_CATEGORY.DRAFT_EBIDDING,
    status: "ambiguous",
    source: "national_egp",
    lookupMethod: null,
    downloadMethod: DOWNLOAD_METHOD.FILE_ID,
    fileId: null,
    fileName: null,
    downloadUrl: null,
    candidateCount: candidates.length,
    candidates: candidates.map((candidate) => createCandidateDiagnostic(candidate)),
    ...details,
  };
}

/**
 * Copy the locator and revision fields needed to explain a discovered candidate.
 */
function createCandidateDiagnostic(candidate) {
  const diagnostic = {};
  for (const field of [
    "fileId",
    "fileName",
    "revision",
    "lookupMethod",
    "publishedAt",
    "commentDeadlineAt",
    "legacyItemNo",
    "legacyTypeId",
    "legacyDocType",
    "legacyMethodId",
    "legacyStepId",
  ]) {
    if (candidate[field] !== undefined) diagnostic[field] = candidate[field];
  }
  return diagnostic;
}

/**
 * Build the URL for the selected download method; legacy draft transfer parameters are handled by the downloader.
 */
function buildDocumentDownloadUrl(metadata) {
  if (metadata.downloadMethod === DOWNLOAD_METHOD.CHUNKED_DOCUMENT) {
    const url = new URL("/egp-agpc01-web/common/download/", EGP_BASE_URL);
    url.pathname += `${encodeURIComponent(metadata.projectId)}/${encodeURIComponent(
      metadata.fileId
    )}`;
    return url.toString();
  }

  if (metadata.downloadMethod === DOWNLOAD_METHOD.LEGACY_DRAFT_TRANSFER) {
    return new URL(
      LEGACY_DRAFT_TRANSFER_PATH,
      EGP_LEGACY_FILE_BASE_URL
    ).toString();
  }

  if (metadata.downloadMethod === DOWNLOAD_METHOD.LEGACY_FILENAME) {
    const url = new URL(
      "/egp2procmainWeb/FPRO9965AttachServ",
      EGP_LEGACY_BASE_URL
    );
    url.searchParams.set("projectId", metadata.projectId);
    url.searchParams.set("fileName", metadata.fileName);
    return url.toString();
  }

  const url = new URL("/egp-upload-service/v1/downloadFileTest", EGP_BASE_URL);
  url.searchParams.set("fileId", metadata.fileId);
  return url.toString();
}

module.exports = {
  createDocumentMetadata,
  createNotFoundMetadata,
  createAmbiguousMetadata,
  createCandidateDiagnostic,
  buildDocumentDownloadUrl,
};

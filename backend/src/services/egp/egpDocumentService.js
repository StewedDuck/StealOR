/**
 * Application workflow for official e-GP documents: discover categories, select
 * usable references, download original ZIPs and optionally extract PDF text.
 * Metadata describes a document; a ZIP buffer contains its actual file bytes.
 * This service does not run AI analysis or write records to MongoDB.
 */
const crypto = require("crypto");
const path = require("path");
const pdfParse = require("pdf-parse");
const unzipper = require("unzipper");
const {
  DOCUMENT_CATEGORY,
  ERROR_KIND,
  EgpServiceError,
  validateProjectId,
  nationalEgpAdapter,
} = require("./egpClient");

const MAX_PDF_COUNT = 20;
const MAX_TOTAL_PDF_BYTES = 100 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 2_000_000;

/**
 * Use a supplied e-GP adapter when provided, otherwise use the shared national adapter.
 */
function getAdapter(dependencies) {
  return dependencies.egpAdapter || nationalEgpAdapter;
}

/**
 * Convert a discovery failure into stored metadata, distinguishing confirmed absence from an upstream error.
 */
function documentDiscoveryError(projectId, category, error, lastCheckedAt) {
  const lookupAttempts = Array.isArray(error?.details?.lookupAttempts)
    ? { lookupAttempts: error.details.lookupAttempts }
    : {};
  if (error?.kind === ERROR_KIND.NOT_FOUND) {
    return {
      projectId,
      category,
      status: "not_found",
      source: "national_egp",
      lookupMethod: null,
      downloadMethod: null,
      fileId: null,
      fileName: null,
      downloadUrl: null,
      lastCheckedAt,
      ...lookupAttempts,
    };
  }

  return {
    projectId,
    category,
    status: "error",
    source: "national_egp",
    lookupMethod: null,
    downloadMethod: null,
    fileId: null,
    fileName: null,
    downloadUrl: null,
    lastCheckedAt,
    error: {
      code: error?.code || "EGP_SERVICE_ERROR",
      kind: error?.kind || ERROR_KIND.RECOVERABLE,
      message: String(error?.message || "Document discovery failed").slice(0, 500),
    },
    ...lookupAttempts,
  };
}

/**
 * Prefer an available invitation; use an available draft only when the invitation is confirmed absent. Otherwise return null.
 */
function selectProcurementDocument(documents) {
  if (documents.invitation.status === "available") return "invitation";

  // An error is not evidence that Invitation is absent. Draft becomes the
  // fallback only after e-GP positively reports Invitation as not found.
  if (
    documents.invitation.status === "not_found" &&
    documents.draftEbidding.status === "available"
  ) {
    return "draftEbidding";
  }
  return null;
}

/**
 * Validate a project ID and discover metadata for price, invitation and draft documents.
 * Checks categories sequentially, isolates failures, and returns all statuses
 * plus the selected procurement document. Does not download archives.
 */
async function discoverProjectDocuments(projectId, dependencies = {}) {
  const safeProjectId = validateProjectId(projectId);
  const adapter = getAdapter(dependencies);
  const checkedAtValue = dependencies.now ? dependencies.now() : new Date();
  const lastCheckedAt =
    checkedAtValue instanceof Date ? checkedAtValue : new Date(checkedAtValue);
  const discoveryOptions = { ...dependencies, metadataCache: new Map() };
  const documents = {};
  const discoveries = [
    [
      "priceEstimate",
      DOCUMENT_CATEGORY.PRICE_ESTIMATE,
      () => adapter.discoverPriceEstimate(safeProjectId, discoveryOptions),
    ],
    [
      "invitation",
      DOCUMENT_CATEGORY.INVITATION,
      () => adapter.discoverInvitation(safeProjectId, discoveryOptions),
    ],
    [
      "draftEbidding",
      DOCUMENT_CATEGORY.DRAFT_EBIDDING,
      () => adapter.discoverDraftEbidding(safeProjectId, discoveryOptions),
    ],
  ];

  // Run sequentially to be polite to e-GP, but isolate each failure so one
  // category can never prevent the other two categories from being checked.
  for (const [key, category, discover] of discoveries) {
    try {
      documents[key] = { ...(await discover()), lastCheckedAt };
    } catch (error) {
      documents[key] = documentDiscoveryError(
        safeProjectId,
        category,
        error,
        lastCheckedAt
      );
    }
  }

  documents.selectedProcurementDocument = selectProcurementDocument(documents);
  return { projectId: safeProjectId, documents };
}

/**
 * Delegate archive downloading to the adapter, which selects the upstream download mechanism.
 */
async function downloadPriceEstimateArchive(metadata, dependencies) {
  // The service handles application workflow; the adapter owns all knowledge
  // of modern file-ID downloads versus the legacy filename servlet.
  return getAdapter(dependencies).downloadDocument(metadata, dependencies);
}

class DocumentExtractionError extends Error {
  constructor(message, statusCode = 422, details = {}) {
    super(message);
    this.name = "DocumentExtractionError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Reject absolute paths and parent-directory segments in archive entry names.
 */
function isSafeArchivePath(entryPath) {
  const normalized = String(entryPath).replace(/\\/g, "/");
  return !normalized.startsWith("/") && !normalized.split("/").includes("..");
}

/**
 * Read PDF entries from a ZIP buffer and combine their extractable text.
 * Enforces count/size/path/signature limits and returns text plus PDF filenames.
 * Throws for unusable archives or insufficient text; scanned images require OCR
 * that this function does not implement.
 */
async function extractPdfTextFromZip(zipBuffer, { parsePdf = pdfParse } = {}) {
  let directory;
  try {
    directory = await unzipper.Open.buffer(zipBuffer);
  } catch (error) {
    throw new DocumentExtractionError(`Unable to open e-GP ZIP: ${error.message}`);
  }

  const pdfEntries = directory.files
    .filter((entry) => entry.type === "File" && path.extname(entry.path).toLowerCase() === ".pdf")
    .sort((left, right) => left.path.localeCompare(right.path, "en", { numeric: true }));

  if (pdfEntries.length === 0) {
    throw new DocumentExtractionError("The e-GP ZIP contains no PDF files");
  }
  if (pdfEntries.length > MAX_PDF_COUNT) {
    throw new DocumentExtractionError("The e-GP ZIP contains too many PDF files");
  }

  let totalPdfBytes = 0;
  const textParts = [];
  const pdfFileNames = [];

  for (const entry of pdfEntries) {
    if (!isSafeArchivePath(entry.path)) {
      throw new DocumentExtractionError("The e-GP ZIP contains an unsafe file path");
    }
    totalPdfBytes += Number(entry.uncompressedSize || 0);
    if (totalPdfBytes > MAX_TOTAL_PDF_BYTES) {
      throw new DocumentExtractionError("The uncompressed PDFs exceed the size limit");
    }

    const pdfBuffer = await entry.buffer();
    if (pdfBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new DocumentExtractionError(`${entry.path} does not have a valid PDF signature`);
    }

    let parsed;
    try {
      parsed = await parsePdf(pdfBuffer);
    } catch (error) {
      throw new DocumentExtractionError(`Unable to read ${entry.path}: ${error.message}`);
    }

    const text = String(parsed?.text || "").replace(/\u0000/g, "").trim();
    pdfFileNames.push(path.basename(entry.path));
    if (text) textParts.push(`--- ${path.basename(entry.path)} ---\n${text}`);
  }

  const extractedText = textParts.join("\n\n").trim();
  if (extractedText.length < 40) {
    throw new DocumentExtractionError(
      "PDF contains no extractable text; OCR is not implemented yet",
      422,
      { pdfFileNames, textLength: extractedText.length }
    );
  }
  if (extractedText.length > MAX_EXTRACTED_TEXT_CHARS) {
    throw new DocumentExtractionError("Extracted PDF text exceeds the storage safety limit");
  }

  return { extractedText, textLength: extractedText.length, pdfFileNames };
}

/**
 * Discover and download a price archive, hash its bytes, and extract PDF text.
 * Returns source metadata and extracted text; attaches source metadata to
 * download/extraction errors so callers can record which document failed.
 */
async function getPriceEstimateDocument(projectId, dependencies = {}) {
  const safeProjectId = validateProjectId(projectId);
  const metadata = await getAdapter(dependencies).discoverPriceEstimate(
    safeProjectId,
    dependencies
  );
  const documentMetadata = {
    projectId: safeProjectId,
    source: "egp",
    sourceDocumentType: "price_estimate",
    sourceDocument: metadata.fileName,
    sourceFileId: metadata.fileId,
    sourceSha256: null,
    pdfFileNames: [],
    textLength: 0,
  };

  let zipBuffer;
  try {
    zipBuffer = await downloadPriceEstimateArchive(metadata, dependencies);
  } catch (error) {
    error.documentMetadata = documentMetadata;
    throw error;
  }

  documentMetadata.sourceSha256 = crypto
    .createHash("sha256")
    .update(zipBuffer)
    .digest("hex");

  let extraction;
  try {
    extraction = await extractPdfTextFromZip(zipBuffer, dependencies);
  } catch (error) {
    error.documentMetadata = {
      ...documentMetadata,
      pdfFileNames: error.details?.pdfFileNames || [],
      textLength: Number(error.details?.textLength || 0),
    };
    throw error;
  }

  return {
    ...documentMetadata,
    ...extraction,
  };
}

/**
 * Return the original price-estimate ZIP and its file reference. Reuse a stored
 * reference when available; rediscover and retry once if that reference is stale.
 */
async function getPriceEstimateArchive(
  projectId,
  knownMetadata = {},
  dependencies = {}
) {
  const safeProjectId = validateProjectId(projectId);
  const adapter = getAdapter(dependencies);
  const hasStoredReference = Boolean(
    knownMetadata.fileId ||
      (knownMetadata.downloadMethod === "legacy_filename" && knownMetadata.fileName)
  );

  // Reuse either the new MongoDB reference or a migrated legacy filename.
  // The adapter still owns the distinction between both download mechanisms.
  let metadata = hasStoredReference
    ? {
        projectId: safeProjectId,
        fileId: knownMetadata.fileId || null,
        fileName: knownMetadata.fileName || `${safeProjectId}.zip`,
        downloadMethod:
          knownMetadata.downloadMethod ||
          (knownMetadata.fileId ? "file_id" : "legacy_filename"),
      }
    : await adapter.discoverPriceEstimate(safeProjectId, dependencies);

  // Return the untouched ZIP. Text extraction and OCR are intentionally skipped.
  let zipBuffer;
  try {
    zipBuffer = await downloadPriceEstimateArchive(metadata, dependencies);
  } catch (error) {
    const shouldRediscover =
      hasStoredReference &&
      adapter.shouldRediscoverAfterDownloadError?.(error) === true;
    if (!shouldRediscover) throw error;

    // A stale MongoDB file ID gets one fresh metadata lookup and one retry.
    // This avoids permanently pinning downloads to an obsolete upstream ID.
    metadata = await adapter.discoverPriceEstimate(safeProjectId, dependencies);
    zipBuffer = await downloadPriceEstimateArchive(metadata, dependencies);
  }
  return {
    projectId: safeProjectId,
    fileId: metadata.fileId,
    fileName: metadata.fileName,
    zipBuffer,
  };
}

/**
 * Validate the project ID and look up invitation metadata without downloading its archive.
 */
async function getInvitationMetadata(projectId, dependencies = {}) {
  const safeProjectId = validateProjectId(projectId);
  return getAdapter(dependencies).discoverInvitation(
    safeProjectId,
    dependencies
  );
}

/**
 * Require an available invitation with a file ID; otherwise throw a not-found service error.
 */
function requireInvitationArchiveMetadata(metadata) {
  if (metadata.status === "available" && metadata.fileId) return metadata;
  throw new EgpServiceError(
    "No invitation bidding-document ZIP found",
    422,
    {
      code: "EGP_INVITATION_NOT_FOUND",
      kind: ERROR_KIND.NOT_FOUND,
    }
  );
}

/**
 * Download the invitation bidding-document ZIP using a stored or discovered file ID.
 * A stale stored reference gets one fresh discovery and retry; returns bytes and file metadata.
 */
async function getInvitationArchive(
  projectId,
  knownMetadata = {},
  dependencies = {}
) {
  const safeProjectId = validateProjectId(projectId);
  const adapter = getAdapter(dependencies);
  const hasStoredFileId = Boolean(knownMetadata.fileId);
  let metadata = hasStoredFileId
    ? {
        projectId: safeProjectId,
        category: DOCUMENT_CATEGORY.INVITATION,
        status: "available",
        fileId: knownMetadata.fileId,
        fileName: knownMetadata.fileName || `${safeProjectId}.zip`,
        downloadMethod: "file_id",
      }
    : await adapter.discoverInvitation(safeProjectId, dependencies);

  requireInvitationArchiveMetadata(metadata);

  // This downloads the bidding-document archive only. The announcement PDF
  // template reference is metadata and is intentionally not used here.
  let zipBuffer;
  try {
    zipBuffer = await adapter.downloadDocument(metadata, dependencies);
  } catch (error) {
    const shouldRediscover =
      hasStoredFileId &&
      adapter.shouldRediscoverAfterDownloadError?.(error) === true;
    if (!shouldRediscover) throw error;
    metadata = await adapter.discoverInvitation(safeProjectId, dependencies);
    requireInvitationArchiveMetadata(metadata);
    zipBuffer = await adapter.downloadDocument(metadata, dependencies);
  }
  return {
    projectId: safeProjectId,
    fileId: metadata.fileId,
    fileName: metadata.fileName,
    zipBuffer,
  };
}

/**
 * Validate the project ID and discover draft e-bidding metadata without downloading the archive.
 */
async function getDraftEbiddingMetadata(projectId, dependencies = {}) {
  const safeProjectId = validateProjectId(projectId);
  return getAdapter(dependencies).discoverDraftEbidding(
    safeProjectId,
    dependencies
  );
}

/**
 * Check that metadata contains the required locator fields for a legacy draft transfer.
 */
function hasLegacyDraftReference(metadata) {
  const itemNo = metadata?.legacyItemNo;
  return Boolean(
    metadata?.downloadMethod === "legacy_draft_transfer" &&
      metadata.fileName &&
      itemNo !== null &&
      itemNo !== undefined &&
      Number.isSafeInteger(Number(itemNo)) &&
      Number(itemNo) >= 0 &&
      metadata.legacyTypeId &&
      metadata.legacyDocType &&
      metadata.legacyMethodId
  );
}

/**
 * Require an available draft with a usable locator; reject missing or ambiguous selections instead of guessing.
 */
function requireDraftArchiveMetadata(metadata) {
  if (
    metadata.status === "available" &&
    (metadata.fileId || hasLegacyDraftReference(metadata))
  ) {
    return metadata;
  }
  const ambiguous = metadata.status === "ambiguous";
  throw new EgpServiceError(
    ambiguous
      ? "Draft e-Bidding ZIP selection is ambiguous"
      : "No Draft e-Bidding ZIP found",
    422,
    {
      code: ambiguous
        ? "EGP_DRAFT_EBIDDING_AMBIGUOUS"
        : "EGP_DRAFT_EBIDDING_NOT_FOUND",
      kind: ambiguous ? ERROR_KIND.INVALID_RESPONSE : ERROR_KIND.NOT_FOUND,
      details: ambiguous
        ? {
            candidateCount: metadata.candidateCount,
            ambiguityReason: metadata.ambiguityReason,
          }
        : {},
    }
  );
}

/**
 * Download a selected draft ZIP through its modern file ID or legacy locator.
 * Reuse stored references, rediscover once on a stale-reference error, and
 * return ZIP bytes with revision and source-reference metadata.
 */
async function getDraftEbiddingArchive(
  projectId,
  knownMetadata = {},
  dependencies = {}
) {
  const safeProjectId = validateProjectId(projectId);
  const adapter = getAdapter(dependencies);
  const hasStoredFileId = Boolean(knownMetadata.fileId);
  const hasStoredLegacyReference = hasLegacyDraftReference(knownMetadata);
  const hasStoredReference = hasStoredFileId || hasStoredLegacyReference;
  let metadata = hasStoredReference
    ? {
        projectId: safeProjectId,
        category: DOCUMENT_CATEGORY.DRAFT_EBIDDING,
        status: "available",
        fileId: knownMetadata.fileId || null,
        fileName: knownMetadata.fileName || `${safeProjectId}.zip`,
        downloadMethod: hasStoredFileId
          ? "file_id"
          : "legacy_draft_transfer",
        legacyItemNo: knownMetadata.legacyItemNo ?? null,
        legacyTypeId: knownMetadata.legacyTypeId || null,
        legacyDocType: knownMetadata.legacyDocType || null,
        legacyMethodId: knownMetadata.legacyMethodId || null,
        legacyStepId: knownMetadata.legacyStepId || null,
        revision: knownMetadata.revision ?? null,
        version: knownMetadata.version ?? null,
      }
    : await adapter.discoverDraftEbidding(safeProjectId, dependencies);

  requireDraftArchiveMetadata(metadata);

  // Only an unambiguous selected revision reaches the shared ZIP downloader.
  // Ambiguous discovery results never cause an arbitrary upstream download.
  let zipBuffer;
  try {
    zipBuffer = await adapter.downloadDocument(metadata, dependencies);
  } catch (error) {
    const shouldRediscover =
      hasStoredReference &&
      adapter.shouldRediscoverAfterDownloadError?.(error) === true;
    if (!shouldRediscover) throw error;
    metadata = await adapter.discoverDraftEbidding(safeProjectId, dependencies);
    requireDraftArchiveMetadata(metadata);
    zipBuffer = await adapter.downloadDocument(metadata, dependencies);
  }
  return {
    projectId: safeProjectId,
    fileId: metadata.fileId,
    fileName: metadata.fileName,
    revision: metadata.revision ?? null,
    version: metadata.version ?? null,
    legacyItemNo: metadata.legacyItemNo ?? null,
    legacyTypeId: metadata.legacyTypeId ?? null,
    legacyDocType: metadata.legacyDocType ?? null,
    legacyMethodId: metadata.legacyMethodId ?? null,
    zipBuffer,
  };
}

module.exports = {
  DocumentExtractionError,
  validateProjectId,
  isSafeArchivePath,
  extractPdfTextFromZip,
  getPriceEstimateArchive,
  getPriceEstimateDocument,
  getInvitationMetadata,
  getInvitationArchive,
  getDraftEbiddingMetadata,
  getDraftEbiddingArchive,
  discoverProjectDocuments,
  selectProcurementDocument,
};

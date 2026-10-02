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

function getAdapter(dependencies) {
  return dependencies.egpAdapter || nationalEgpAdapter;
}

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

function isSafeArchivePath(entryPath) {
  const normalized = String(entryPath).replace(/\\/g, "/");
  return !normalized.startsWith("/") && !normalized.split("/").includes("..");
}

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

async function getPriceEstimateArchive(
  projectId,
  knownMetadata = {},
  dependencies = {}
) {
  const safeProjectId = validateProjectId(projectId);
  const adapter = getAdapter(dependencies);
  const hasStoredFileId = Boolean(knownMetadata.fileId);

  // Reuse MongoDB metadata when available; otherwise ask e-GP for the file ID.
  let metadata = hasStoredFileId
    ? {
        projectId: safeProjectId,
        fileId: knownMetadata.fileId,
        fileName: knownMetadata.fileName || `${safeProjectId}.zip`,
      }
    : await adapter.discoverPriceEstimate(safeProjectId, dependencies);

  // Return the untouched ZIP. Text extraction and OCR are intentionally skipped.
  let zipBuffer;
  try {
    zipBuffer = await downloadPriceEstimateArchive(metadata, dependencies);
  } catch (error) {
    const shouldRediscover =
      hasStoredFileId &&
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

async function getInvitationMetadata(projectId, dependencies = {}) {
  const safeProjectId = validateProjectId(projectId);
  return getAdapter(dependencies).discoverInvitation(
    safeProjectId,
    dependencies
  );
}

async function getInvitationArchive(
  projectId,
  knownMetadata = {},
  dependencies = {}
) {
  const safeProjectId = validateProjectId(projectId);
  const adapter = getAdapter(dependencies);
  const metadata = knownMetadata.fileId
    ? {
        projectId: safeProjectId,
        category: DOCUMENT_CATEGORY.INVITATION,
        status: "available",
        fileId: knownMetadata.fileId,
        fileName: knownMetadata.fileName || `${safeProjectId}.zip`,
        downloadMethod: "file_id",
      }
    : await adapter.discoverInvitation(safeProjectId, dependencies);

  if (metadata.status !== "available" || !metadata.fileId) {
    throw new EgpServiceError(
      "No invitation bidding-document ZIP found",
      422,
      {
        code: "EGP_INVITATION_NOT_FOUND",
        kind: ERROR_KIND.NOT_FOUND,
      }
    );
  }

  // This downloads the bidding-document archive only. The announcement PDF
  // template reference is metadata and is intentionally not used here.
  const zipBuffer = await adapter.downloadDocument(metadata, dependencies);
  return {
    projectId: safeProjectId,
    fileId: metadata.fileId,
    fileName: metadata.fileName,
    zipBuffer,
  };
}

async function getDraftEbiddingMetadata(projectId, dependencies = {}) {
  const safeProjectId = validateProjectId(projectId);
  return getAdapter(dependencies).discoverDraftEbidding(
    safeProjectId,
    dependencies
  );
}

async function getDraftEbiddingArchive(
  projectId,
  knownMetadata = {},
  dependencies = {}
) {
  const safeProjectId = validateProjectId(projectId);
  const adapter = getAdapter(dependencies);
  const metadata = knownMetadata.fileId
    ? {
        projectId: safeProjectId,
        category: DOCUMENT_CATEGORY.DRAFT_EBIDDING,
        status: "available",
        fileId: knownMetadata.fileId,
        fileName: knownMetadata.fileName || `${safeProjectId}.zip`,
        downloadMethod: "file_id",
      }
    : await adapter.discoverDraftEbidding(safeProjectId, dependencies);

  if (metadata.status !== "available" || !metadata.fileId) {
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

  // Only an unambiguous selected revision reaches the shared ZIP downloader.
  // Ambiguous discovery results never cause an arbitrary upstream download.
  const zipBuffer = await adapter.downloadDocument(metadata, dependencies);
  return {
    projectId: safeProjectId,
    fileId: metadata.fileId,
    fileName: metadata.fileName,
    revision: metadata.revision ?? null,
    version: metadata.version ?? null,
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
};

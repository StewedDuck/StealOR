const crypto = require("crypto");
const path = require("path");
const pdfParse = require("pdf-parse");
const unzipper = require("unzipper");
const {
  validateProjectId,
  getPriceEstimateMetadata,
  downloadZip,
} = require("./egpClient");

const MAX_PDF_COUNT = 20;
const MAX_TOTAL_PDF_BYTES = 100 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 2_000_000;

class DocumentExtractionError extends Error {
  constructor(message, statusCode = 422) {
    super(message);
    this.name = "DocumentExtractionError";
    this.statusCode = statusCode;
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
      "PDF contains no extractable text; OCR is not implemented yet"
    );
  }
  if (extractedText.length > MAX_EXTRACTED_TEXT_CHARS) {
    throw new DocumentExtractionError("Extracted PDF text exceeds the storage safety limit");
  }

  return { extractedText, textLength: extractedText.length, pdfFileNames };
}

async function getPriceEstimateDocument(projectId, dependencies = {}) {
  const safeProjectId = validateProjectId(projectId);
  const metadata = await getPriceEstimateMetadata(safeProjectId, dependencies);
  const zipBuffer = await downloadZip(metadata.fileId, dependencies);
  const extraction = await extractPdfTextFromZip(zipBuffer, dependencies);

  return {
    projectId: safeProjectId,
    source: "egp",
    sourceDocumentType: "price_estimate",
    sourceDocument: metadata.fileName,
    sourceFileId: metadata.fileId,
    sourceSha256: crypto.createHash("sha256").update(zipBuffer).digest("hex"),
    ...extraction,
  };
}

module.exports = {
  DocumentExtractionError,
  validateProjectId,
  isSafeArchivePath,
  extractPdfTextFromZip,
  getPriceEstimateDocument,
};

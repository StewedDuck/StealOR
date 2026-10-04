// แตก ZIP และตรวจสอบ PDF
// artifact. It enforces archive limits and path safety, but does not
// publish final artifacts, extract PDF text, or perform OCR.
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const unzipper = require("unzipper");
const {
  GovProjectDocumentExtractionError,
  extractionError,
} = require("./errors");

const MAX_ARCHIVE_ENTRIES = 1_000;
const MAX_PDF_COUNT = 20;
const MAX_TOTAL_PDF_BYTES = 100 * 1024 * 1024;

function normalizedArchivePath(entryPath) {
  return String(entryPath || "").replace(/\\/g, "/");
}

function isSafePhaseBArchivePath(entryPath) {
  const normalized = normalizedArchivePath(entryPath);
  if (
    normalized.length === 0 ||
    normalized.length > 1_024 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    return false;
  }

  const withoutTrailingSlash = normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
  const segments = withoutTrailingSlash.split("/");
  return (
    segments.length > 0 &&
    segments.every(
      (segment) => segment.length > 0 && segment !== "." && segment !== ".."
    )
  );
}

function sanitizeWindowsPathSegment(segment) {
  let safe = String(segment)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/[ .]+$/g, (match) => "_".repeat(match.length));
  if (!safe) safe = "_";

  const stem = safe.split(".", 1)[0];
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem)) {
    safe = `_${safe}`;
  }
  return safe;
}

function safePdfRelativePath(entryPath) {
  const normalized = normalizedArchivePath(entryPath);
  return normalized
    .split("/")
    .map(sanitizeWindowsPathSegment)
    .join("/");
}

function addCollisionSuffix(relativePath, number) {
  const extension = path.posix.extname(relativePath);
  const base = relativePath.slice(0, relativePath.length - extension.length);
  return `${base}__${number}${extension}`;
}

function uniquePdfRelativePath(entryPath, claimedPaths) {
  const initial = safePdfRelativePath(entryPath);
  let candidate = initial;
  let suffix = 2;
  while (claimedPaths.has(candidate.toLocaleLowerCase("en-US"))) {
    candidate = addCollisionSuffix(initial, suffix);
    suffix += 1;
  }
  claimedPaths.add(candidate.toLocaleLowerCase("en-US"));
  return candidate;
}

async function pathExists(targetPath, fileSystem = fs) {
  try {
    await fileSystem.lstat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function openArchive(zipBuffer, openZip) {
  if (!Buffer.isBuffer(zipBuffer)) {
    throw new TypeError("zipBuffer must be a Buffer");
  }
  try {
    return await openZip(zipBuffer);
  } catch (error) {
    throw extractionError(
      "invalid_zip",
      `Unable to open ZIP archive: ${error.message}`,
      { stage: "archive_open" }
    );
  }
}

function inspectArchiveEntries(entries) {
  if (!Array.isArray(entries)) {
    throw extractionError("invalid_zip", "ZIP directory has no entry list", {
      stage: "inspection",
    });
  }
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw extractionError(
      "too_many_archive_entries",
      `ZIP archive exceeds the ${MAX_ARCHIVE_ENTRIES}-entry limit`,
      { stage: "inspection", entryCount: entries.length }
    );
  }

  for (const entry of entries) {
    if (!isSafePhaseBArchivePath(entry?.path)) {
      throw extractionError(
        "unsafe_archive_path",
        `ZIP archive contains an unsafe entry path: ${String(entry?.path || "")}`,
        { stage: "inspection", entryPath: String(entry?.path || "") }
      );
    }
  }

  const pdfEntries = entries.filter(
    (entry) =>
      entry.type === "File" &&
      path.posix.extname(normalizedArchivePath(entry.path)).toLowerCase() ===
        ".pdf"
  );
  if (pdfEntries.length === 0) {
    throw extractionError("no_pdf_entries", "ZIP archive contains no PDF files", {
      stage: "inspection",
    });
  }
  if (pdfEntries.length > MAX_PDF_COUNT) {
    throw extractionError(
      "too_many_pdf_entries",
      `ZIP archive exceeds the ${MAX_PDF_COUNT}-PDF limit`,
      { stage: "inspection", pdfCount: pdfEntries.length }
    );
  }

  let advertisedTotal = 0;
  for (const entry of pdfEntries) {
    const size = Number(entry.uncompressedSize);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw extractionError(
        "invalid_pdf_size",
        `ZIP entry has an invalid uncompressed size: ${entry.path}`,
        { stage: "inspection", entryPath: entry.path }
      );
    }
    advertisedTotal += size;
    if (advertisedTotal > MAX_TOTAL_PDF_BYTES) {
      throw extractionError(
        "pdf_size_limit_exceeded",
        "Uncompressed PDFs exceed the total size limit",
        { stage: "inspection", advertisedTotal }
      );
    }
  }
  return pdfEntries;
}

async function streamPdfToStage({
  entry,
  destinationPath,
  remainingBytes,
  fileSystem,
  createWriteStream,
}) {
  const hash = crypto.createHash("sha256");
  let sizeBytes = 0;
  let header = Buffer.alloc(0);
  const validator = new Transform({
    transform(chunk, encoding, callback) {
      const buffer = Buffer.from(chunk);
      sizeBytes += buffer.length;
      if (sizeBytes > remainingBytes) {
        callback(
          extractionError(
            "pdf_size_limit_exceeded",
            "Uncompressed PDFs exceed the total size limit",
            { stage: "extraction", entryPath: entry.path }
          )
        );
        return;
      }
      if (header.length < 5) {
        header = Buffer.concat([header, buffer]).subarray(0, 5);
      }
      hash.update(buffer);
      callback(null, buffer);
    },
  });

  await fileSystem.mkdir(path.dirname(destinationPath), { recursive: true });
  try {
    await pipeline(
      entry.stream(),
      validator,
      createWriteStream(destinationPath, { flags: "wx" })
    );
  } catch (error) {
    if (error instanceof GovProjectDocumentExtractionError) throw error;
    throw extractionError(
      "pdf_extraction_failed",
      `Unable to extract ${entry.path}: ${error.message}`,
      { stage: "extraction", entryPath: entry.path }
    );
  }

  if (header.toString("ascii") !== "%PDF-") {
    throw extractionError(
      "invalid_pdf_signature",
      `${entry.path} does not have a valid PDF signature`,
      { stage: "extraction", entryPath: entry.path }
    );
  }
  return { sizeBytes, sha256: hash.digest("hex") };
}

async function stagePdfArchive(zipBuffer, options = {}) {
  const stagingDirectory = path.resolve(String(options.stagingDirectory || ""));
  if (!options.stagingDirectory) {
    throw new TypeError("stagingDirectory is required");
  }
  const fileSystem = options.fs || fs;
  const createWriteStream =
    options.createWriteStream || require("node:fs").createWriteStream;
  const openZip =
    options.openZip || ((buffer) => unzipper.Open.buffer(buffer));

  if (await pathExists(stagingDirectory, fileSystem)) {
    throw extractionError(
      "staging_path_exists",
      "Refusing to use an existing staging directory",
      { stage: "staging", stagingDirectory }
    );
  }

  let stagingCreated = false;
  try {
    await fileSystem.mkdir(stagingDirectory, { recursive: true });
    stagingCreated = true;
    const directory = await openArchive(zipBuffer, openZip);
    const pdfEntries = inspectArchiveEntries(directory.files);
    const claimedPaths = new Set();
    const pdfs = [];
    let totalPdfBytes = 0;

    for (const entry of pdfEntries) {
      const artifactRelativePath = path.posix.join(
        "files",
        uniquePdfRelativePath(entry.path, claimedPaths)
      );
      const destinationPath = path.join(
        stagingDirectory,
        ...artifactRelativePath.split("/")
      );
      const extracted = await streamPdfToStage({
        entry,
        destinationPath,
        remainingBytes: MAX_TOTAL_PDF_BYTES - totalPdfBytes,
        fileSystem,
        createWriteStream,
      });
      totalPdfBytes += extracted.sizeBytes;
      pdfs.push({
        originalFileName: path.posix.basename(normalizedArchivePath(entry.path)),
        originalEntryPath: normalizedArchivePath(entry.path),
        artifactRelativePath,
        sizeBytes: extracted.sizeBytes,
        sha256: extracted.sha256,
        status: "staged",
      });
    }

    return { stagingDirectory, pdfs, totalPdfBytes };
  } catch (error) {
    if (stagingCreated) {
      try {
        await fileSystem.rm(stagingDirectory, { recursive: true, force: true });
      } catch (cleanupError) {
        if (error && typeof error === "object") {
          error.cleanupError = cleanupError;
        }
      }
    }
    throw error;
  }
}

module.exports = {
  MAX_ARCHIVE_ENTRIES,
  MAX_PDF_COUNT,
  MAX_TOTAL_PDF_BYTES,
  isSafePhaseBArchivePath,
  stagePdfArchive,
};

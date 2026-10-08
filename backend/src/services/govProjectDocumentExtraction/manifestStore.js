// Builds, writes, reads, and verifies local extraction manifests.
// Manifests connect stored source locators and ZIP hashes to retained PDF
// artifacts without changing MongoDB records.
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createReadStream } = require("node:fs");
const { randomUUID } = require("node:crypto");
const { DOCUMENT_KEYS } = require("../egp/documentReferencePolicy");
const { validateProjectId } = require("../egp/egpClient");
const { extractionError } = require("./errors");

const MANIFEST_FILE_NAME = "manifest.json";
const MANIFEST_SCHEMA_VERSION = 1;

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizedRelativePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function isSafeArtifactRelativePath(value) {
  const normalized = normalizedRelativePath(value);
  if (
    !normalized.startsWith("files/") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    return false;
  }
  return normalized
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function buildExtractionManifest({
  projectId,
  category,
  sourceZipFileName,
  locatorIdentity,
  downloadMethod,
  zipSha256,
  zipSizeBytes,
  pdfs,
  processedAt = new Date(),
}) {
  const safeProjectId = validateProjectId(projectId);
  if (!DOCUMENT_KEYS.includes(category)) {
    throw new TypeError(`Unsupported document category: ${category}`);
  }
  if (!nonEmptyString(sourceZipFileName)) {
    throw new TypeError("sourceZipFileName is required");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(String(locatorIdentity || ""))) {
    throw new TypeError("locatorIdentity must be a canonical SHA-256 identity");
  }
  if (!nonEmptyString(downloadMethod)) {
    throw new TypeError("downloadMethod is required");
  }
  if (!/^[a-f0-9]{64}$/.test(String(zipSha256 || ""))) {
    throw new TypeError("zipSha256 must be a SHA-256 digest");
  }
  if (!Number.isSafeInteger(zipSizeBytes) || zipSizeBytes < 0) {
    throw new TypeError("zipSizeBytes must be a non-negative safe integer");
  }
  if (!Array.isArray(pdfs) || pdfs.length === 0) {
    throw new TypeError("pdfs must contain at least one staged PDF");
  }

  const timestamp =
    processedAt instanceof Date
      ? processedAt.toISOString()
      : new Date(processedAt).toISOString();
  const manifestPdfs = pdfs.map((pdf) => {
    if (!isSafeArtifactRelativePath(pdf.artifactRelativePath)) {
      throw new TypeError(
        `Unsafe PDF artifact path: ${String(pdf.artifactRelativePath || "")}`
      );
    }
    if (!/^[a-f0-9]{64}$/.test(String(pdf.sha256 || ""))) {
      throw new TypeError("PDF sha256 must be a SHA-256 digest");
    }
    if (!Number.isSafeInteger(pdf.sizeBytes) || pdf.sizeBytes < 0) {
      throw new TypeError("PDF sizeBytes must be a non-negative safe integer");
    }
    const artifactRelativePath = normalizedRelativePath(
      pdf.artifactRelativePath
    );
    return {
      originalFileName: String(pdf.originalFileName || ""),
      originalEntryPath: normalizedRelativePath(pdf.originalEntryPath),
      sha256: pdf.sha256,
      sizeBytes: pdf.sizeBytes,
      artifactRelativePath,
      localArtifactPath: path.posix.join(
        "pdfs",
        safeProjectId,
        category,
        artifactRelativePath
      ),
      status: "verified",
    };
  });

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    projectId: safeProjectId,
    category,
    status: "verified",
    processedAt: timestamp,
    source: {
      zipFileName: sourceZipFileName,
      locatorIdentity,
      downloadMethod,
    },
    zip: {
      sha256: zipSha256,
      sizeBytes: zipSizeBytes,
    },
    pdfs: manifestPdfs,
    error: null,
  };
}

async function writeManifestAtomic(
  categoryDirectory,
  manifest,
  dependencies = {}
) {
  const fileSystem = dependencies.fs || fs;
  const manifestPath = path.join(categoryDirectory, MANIFEST_FILE_NAME);
  const temporaryPath = `${manifestPath}.part-${
    dependencies.randomId ? dependencies.randomId() : randomUUID()
  }`;
  await fileSystem.mkdir(categoryDirectory, { recursive: true });
  try {
    await fileSystem.writeFile(
      temporaryPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" }
    );
    await fileSystem.rename(temporaryPath, manifestPath);
    return manifestPath;
  } catch (error) {
    try {
      await fileSystem.rm(temporaryPath, { force: true });
    } catch {
      // Preserve the original manifest write failure.
    }
    throw extractionError(
      "manifest_write_failed",
      `Unable to write extraction manifest: ${error.message}`,
      { stage: "manifest", manifestPath }
    );
  }
}

async function readManifest(categoryDirectory, dependencies = {}) {
  const fileSystem = dependencies.fs || fs;
  const manifestPath = path.join(categoryDirectory, MANIFEST_FILE_NAME);
  let contents;
  try {
    contents = await fileSystem.readFile(manifestPath, "utf8");
  } catch (error) {
    throw extractionError(
      "manifest_unavailable",
      `Unable to read extraction manifest: ${error.message}`,
      { stage: "verification", manifestPath }
    );
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw extractionError(
      "manifest_invalid_json",
      `Extraction manifest is not valid JSON: ${error.message}`,
      { stage: "verification", manifestPath }
    );
  }
}

async function hashFile(filePath, dependencies = {}) {
  const openReadStream = dependencies.createReadStream || createReadStream;
  const hash = crypto.createHash("sha256");
  for await (const chunk of openReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function failedVerification(reason, manifest = null, details = {}) {
  return { verified: false, reason, manifest, ...details };
}

async function verifyCategoryArtifacts(options, dependencies = {}) {
  const categoryDirectory = path.resolve(
    String(options?.categoryDirectory || "")
  );
  if (!options?.categoryDirectory) {
    throw new TypeError("categoryDirectory is required");
  }

  let manifest;
  try {
    manifest = await readManifest(categoryDirectory, dependencies);
  } catch (error) {
    return failedVerification(error.code || "manifest_unavailable", null, {
      error,
    });
  }
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    return failedVerification("unsupported_manifest_version", manifest);
  }
  if (manifest.status !== "verified") {
    return failedVerification("manifest_not_verified", manifest);
  }
  if (
    options.expectedLocatorIdentity &&
    manifest.source?.locatorIdentity !== options.expectedLocatorIdentity
  ) {
    return failedVerification("locator_mismatch", manifest);
  }
  if (!Array.isArray(manifest.pdfs) || manifest.pdfs.length === 0) {
    return failedVerification("manifest_has_no_pdfs", manifest);
  }

  const claimedPaths = new Set();
  for (const pdf of manifest.pdfs) {
    const relativePath = normalizedRelativePath(pdf.artifactRelativePath);
    const comparisonPath = relativePath.toLocaleLowerCase("en-US");
    if (
      !isSafeArtifactRelativePath(relativePath) ||
      claimedPaths.has(comparisonPath)
    ) {
      return failedVerification("unsafe_or_duplicate_artifact_path", manifest, {
        artifactRelativePath: relativePath,
      });
    }
    claimedPaths.add(comparisonPath);

    const artifactPath = path.resolve(
      categoryDirectory,
      ...relativePath.split("/")
    );
    const relativeToCategory = path.relative(categoryDirectory, artifactPath);
    if (
      !relativeToCategory ||
      relativeToCategory.startsWith("..") ||
      path.isAbsolute(relativeToCategory)
    ) {
      return failedVerification("unsafe_or_duplicate_artifact_path", manifest, {
        artifactRelativePath: relativePath,
      });
    }

    let stat;
    try {
      stat = await (dependencies.fs || fs).lstat(artifactPath);
    } catch (error) {
      return failedVerification("artifact_unavailable", manifest, {
        artifactRelativePath: relativePath,
        error,
      });
    }
    if (!stat.isFile()) {
      return failedVerification("artifact_not_file", manifest, {
        artifactRelativePath: relativePath,
      });
    }
    if (stat.size !== pdf.sizeBytes) {
      return failedVerification("artifact_size_mismatch", manifest, {
        artifactRelativePath: relativePath,
      });
    }

    let digest;
    try {
      digest = await hashFile(artifactPath, dependencies);
    } catch (error) {
      return failedVerification("artifact_hash_failed", manifest, {
        artifactRelativePath: relativePath,
        error,
      });
    }
    if (digest !== pdf.sha256) {
      return failedVerification("artifact_hash_mismatch", manifest, {
        artifactRelativePath: relativePath,
      });
    }
  }

  return { verified: true, reason: null, manifest };
}

module.exports = {
  MANIFEST_FILE_NAME,
  MANIFEST_SCHEMA_VERSION,
  buildExtractionManifest,
  isSafeArtifactRelativePath,
  readManifest,
  verifyCategoryArtifacts,
  writeManifestAtomic,
};

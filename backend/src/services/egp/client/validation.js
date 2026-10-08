const { ERROR_KIND, EgpServiceError } = require("./errors");

function validateProjectId(projectId) {
  const normalized = String(projectId || "").trim();
  if (!/^\d{11}$/.test(normalized)) {
    throw new EgpServiceError("Project ID must contain exactly 11 digits", 400, {
      code: "EGP_INVALID_PROJECT_ID",
      kind: ERROR_KIND.INVALID_INPUT,
    });
  }
  return normalized;
}

function validateFileId(fileId) {
  const normalized = String(fileId || "").trim();
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(normalized)) {
    throw new EgpServiceError("e-GP returned an invalid file ID", 502, {
      code: "EGP_INVALID_FILE_ID",
      kind: ERROR_KIND.INVALID_RESPONSE,
    });
  }
  return normalized;
}

function validateUuidDocumentId(fileId) {
  const normalized = validateFileId(fileId);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalized
    )
  ) {
    throw new EgpServiceError("e-GP returned an invalid document UUID", 502, {
      code: "EGP_INVALID_CHUNK_DOCUMENT",
      kind: ERROR_KIND.INVALID_RESPONSE,
    });
  }
  return normalized.toLowerCase();
}

function validateLegacyFileName(fileName, projectId) {
  const normalized = String(fileName || "").trim();
  const expectedSuffix = `_${projectId}.zip`;
  if (
    normalized.length > 255 ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    !normalized.toLowerCase().startsWith("pricebuild_") ||
    !normalized.toLowerCase().endsWith(expectedSuffix.toLowerCase()) ||
    !/^[A-Za-z0-9._-]+$/.test(normalized)
  ) {
    throw new EgpServiceError("e-GP returned an invalid legacy ZIP filename");
  }
  return normalized;
}

function validateZipFileName(fileName) {
  const normalized = String(fileName || "").trim();
  if (
    normalized.length === 0 ||
    normalized.length > 255 ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(normalized) ||
    !normalized.toLowerCase().endsWith(".zip")
  ) {
    throw new EgpServiceError("e-GP returned an invalid ZIP filename", 502, {
      code: "EGP_INVALID_ZIP_FILENAME",
      kind: ERROR_KIND.INVALID_RESPONSE,
    });
  }
  return normalized;
}

module.exports = {
  validateProjectId,
  validateFileId,
  validateUuidDocumentId,
  validateLegacyFileName,
  validateZipFileName,
};

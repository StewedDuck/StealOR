const crypto = require("crypto");
const { DOWNLOAD_METHOD, LOOKUP_METHOD } = require("./client/constants");

const DOCUMENT_KEYS = Object.freeze([
  "priceEstimate",
  "invitation",
  "draftEbidding",
]);

const PERSISTED_REFERENCE_FIELDS = Object.freeze([
  "status",
  "source",
  "lookupMethod",
  "downloadMethod",
  "fileId",
  "fileName",
  "downloadUrl",
  "sha256",
  "publishedAt",
  "commentDeadlineAt",
  "lastCheckedAt",
  "revision",
  "version",
  "candidateCount",
  "announcementTemplateId",
  "legacyItemNo",
  "legacyTypeId",
  "legacyDocType",
  "legacyMethodId",
  "legacyStepId",
  "ambiguityReason",
  "error",
  "lookupAttempts",
  "candidates",
]);

function asPlainObject(value) {
  if (!value || typeof value !== "object") return {};
  return typeof value.toObject === "function"
    ? value.toObject({ depopulate: true })
    : value;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeFileId(value) {
  return (
    nonEmptyString(value) && /^[A-Za-z0-9._-]{1,200}$/.test(value.trim())
  );
}

function safeZipName(value) {
  const normalized = String(value || "").trim();
  return (
    normalized.length > 0 &&
    normalized.length <= 255 &&
    !normalized.includes("/") &&
    !normalized.includes("\\") &&
    !/[\u0000-\u001F\u007F]/.test(normalized) &&
    normalized.toLowerCase().endsWith(".zip")
  );
}

function inferredDownloadMethod(reference) {
  if (nonEmptyString(reference?.downloadMethod)) return reference.downloadMethod;
  if (nonEmptyString(reference?.fileId)) return "file_id";
  return null;
}

function isUsableDocumentReference(category, input, projectId = null) {
  const reference = asPlainObject(input);
  if (reference.status !== "available") return false;

  const method = inferredDownloadMethod(reference);
  if (method === DOWNLOAD_METHOD.CHUNKED_DOCUMENT) {
    return (
      category === "priceEstimate" &&
      safeFileId(reference.fileId) &&
      safeZipName(reference.fileName)
    );
  }
  if (method === "file_id") return safeFileId(reference.fileId);
  if (method === "legacy_filename") {
    const expectedSuffix = projectId ? `_${projectId}.zip` : ".zip";
    return (
      category === "priceEstimate" &&
      safeZipName(reference.fileName) &&
      reference.fileName.toLowerCase().startsWith("pricebuild_") &&
      reference.fileName.toLowerCase().endsWith(expectedSuffix.toLowerCase()) &&
      /^[A-Za-z0-9._-]+$/.test(reference.fileName)
    );
  }
  if (method === "legacy_draft_transfer") {
    const itemNo = Number(reference.legacyItemNo);
    return (
      category === "draftEbidding" &&
      safeZipName(reference.fileName) &&
      Number.isSafeInteger(itemNo) &&
      itemNo >= 0 &&
      nonEmptyString(reference.legacyTypeId) &&
      nonEmptyString(reference.legacyDocType) &&
      nonEmptyString(reference.legacyMethodId)
    );
  }
  return false;
}

function locatorParts(projectId, category, input) {
  const reference = asPlainObject(input);
  if (!isUsableDocumentReference(category, reference, projectId)) return null;
  const method = inferredDownloadMethod(reference);

  if (
    method === DOWNLOAD_METHOD.FILE_ID ||
    method === DOWNLOAD_METHOD.CHUNKED_DOCUMENT
  ) {
    return ["v1", projectId, category, method, reference.fileId];
  }
  if (method === "legacy_filename") {
    return ["v1", projectId, category, method, reference.fileName];
  }
  return [
    "v1",
    projectId,
    category,
    method,
    reference.fileName,
    String(reference.legacyMethodId),
    String(reference.legacyTypeId),
    String(reference.legacyDocType),
    String(Number(reference.legacyItemNo)),
  ];
}

function canonicalLocatorIdentity(projectId, category, reference) {
  const parts = locatorParts(projectId, category, reference);
  if (!parts) return null;
  return `sha256:${crypto
    .createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")}`;
}

function persistableDocumentReference(input) {
  const source = asPlainObject(input);
  const persisted = {};
  for (const field of PERSISTED_REFERENCE_FIELDS) {
    if (source[field] !== undefined) persisted[field] = source[field];
  }
  return persisted;
}

function discrepancyFor(observed) {
  if (observed?.status === "not_found") return "upstream_not_found";
  if (observed?.status === "error") return "upstream_error";
  if (observed?.status === "ambiguous") return "upstream_ambiguous";
  if (observed?.status === "available") return "incomplete_available";
  return "unsupported_refresh_status";
}

function incompleteAvailableError(observed) {
  return {
    status: "error",
    source: observed.source || "national_egp",
    lookupMethod: observed.lookupMethod || null,
    downloadMethod: null,
    fileId: null,
    fileName: null,
    downloadUrl: null,
    lastCheckedAt: observed.lastCheckedAt,
    error: {
      code: "EGP_INCOMPLETE_DOCUMENT_REFERENCE",
      kind: "invalid_response",
      message: "Discovery returned available metadata without a usable locator",
    },
    ...(observed.lookupAttempts
      ? { lookupAttempts: observed.lookupAttempts }
      : {}),
  };
}

function mergeDocumentReference({ projectId, category, stored, observed }) {
  const storedReference = persistableDocumentReference(stored);
  const observedReference = persistableDocumentReference(observed);
  const storedUsable = isUsableDocumentReference(
    category,
    storedReference,
    projectId
  );
  const observedUsable = isUsableDocumentReference(
    category,
    observedReference,
    projectId
  );
  const storedLocatorIdentity = canonicalLocatorIdentity(
    projectId,
    category,
    storedReference
  );
  const observedLocatorIdentity = canonicalLocatorIdentity(
    projectId,
    category,
    observedReference
  );

  if (observedUsable) {
    const sameIdentity =
      storedLocatorIdentity !== null &&
      storedLocatorIdentity === observedLocatorIdentity;
    const effective = { ...observedReference };
    if (sameIdentity && !effective.sha256 && storedReference.sha256) {
      effective.sha256 = storedReference.sha256;
    }
    if (!sameIdentity && !observedReference.sha256) delete effective.sha256;
    return {
      effective,
      action: storedUsable
        ? sameIdentity
          ? "refreshed_same_locator"
          : "replaced_locator"
        : "accepted_available",
      discrepancy: null,
      storedLocatorIdentity,
      observedLocatorIdentity,
    };
  }

  const isAuthoritativeDraftAbsence =
    category === "draftEbidding" &&
    observedReference.status === "not_found" &&
    observedReference.lookupMethod === LOOKUP_METHOD.DRAFT_PUBLIC_CATEGORY;
  if (isAuthoritativeDraftAbsence) {
    return {
      effective: observedReference,
      action: "accepted_authoritative_not_found",
      discrepancy: null,
      storedLocatorIdentity,
      observedLocatorIdentity,
    };
  }

  if (storedUsable) {
    const discrepancy = discrepancyFor(observedReference);
    return {
      effective: storedReference,
      action: `preserved_after_${discrepancy.replace("upstream_", "")}`,
      discrepancy,
      storedLocatorIdentity,
      observedLocatorIdentity,
    };
  }


  if (observedReference.status === "available") {
    return {
      effective: incompleteAvailableError(observedReference),
      action: "rejected_incomplete_available",
      discrepancy: "incomplete_available",
      storedLocatorIdentity,
      observedLocatorIdentity,
    };
  }

  return {
    effective: observedReference,
    action: "accepted_non_available",
    discrepancy: null,
    storedLocatorIdentity,
    observedLocatorIdentity,
  };
}

module.exports = {
  DOCUMENT_KEYS,
  PERSISTED_REFERENCE_FIELDS,
  canonicalLocatorIdentity,
  isUsableDocumentReference,
  mergeDocumentReference,
  persistableDocumentReference,
};

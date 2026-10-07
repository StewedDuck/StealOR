const {
  EGP_BASE_URL,
  ANNOUNCEMENT_PATH,
  LOOKUP_METHOD,
  DOWNLOAD_METHOD,
} = require("./constants");
const { ERROR_KIND, EgpServiceError } = require("./errors");
const {
  validateProjectId,
  validateFileId,
  validateLegacyFileName,
  validateUuidDocumentId,
} = require("./validation");
const { request, readMetadataJson } = require("./transport");
const { createDocumentMetadata } = require("./metadata");
const { encryptAnnouncementData } = require("./publicAnnouncement");
const { getChunkedDocumentInfo } = require("./downloads");

async function getPrimaryPriceEstimateMetadata(projectId, options) {
  const url = new URL(
    "/egp-doc-price-estimate-service/dpe-common/infoDocPriceestZipHis",
    EGP_BASE_URL
  );
  url.searchParams.set("projectId", projectId);

  const response = await request(url, options);
  const payload = await readMetadataJson(response, "primary");

  if (payload?.response?.responseCode !== "0" || !payload?.data?.zipFileId) {
    return null;
  }

  return createDocumentMetadata({
    projectId,
    fileId: validateFileId(payload.data.zipFileId),
    fileName: String(payload.data.zipFileName || `${projectId}.zip`),
    lookupMethod: LOOKUP_METHOD.PRICE_PRIMARY,
  });
}

async function getFallbackPriceEstimateMetadata(projectId, options) {
  const apiKey = String(
    options.projectServiceApiKey || process.env.EGP_PROJECT_SERVICE_API_KEY || ""
  ).trim();
  if (!apiKey) {
    throw new EgpServiceError(
      "EGP_PROJECT_SERVICE_API_KEY is required for fallback document lookup",
      500,
      {
        code: "EGP_FALLBACK_KEY_MISSING",
        kind: ERROR_KIND.CONFIGURATION,
      }
    );
  }

  const url = new URL(
    "/egp-project-service/listProjectPriceBuildZipByProjectId",
    EGP_BASE_URL
  );
  url.searchParams.set("projectId", projectId);

  // This is the second lookup used by the public e-GP announcement website.
  const response = await request(url, {
    ...options,
    headers: { ...options.headers, apikey: apiKey },
  });
  const payload = await readMetadataJson(response, "fallback");
  const records = Array.isArray(payload?.data) ? payload.data : [];
  // Match the website behavior by preferring the last usable archive returned.
  const record = [...records].reverse().find((item) => item?.zipFileId);
  if (payload?.response?.responseCode !== "0" || !record) return null;

  return createDocumentMetadata({
    projectId,
    fileId: validateFileId(record.zipFileId),
    fileName: String(
      record.priceBuildName || record.zipFileName || `${projectId}.zip`
    ),
    lookupMethod: LOOKUP_METHOD.PRICE_PROJECT_SERVICE,
  });
}

async function getPublicPriceEvidence(projectId, options) {
  const cache = options.metadataCache instanceof Map ? options.metadataCache : null;
  const cacheKey = `public-price-evidence:${projectId}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey);

  const lookup = getPublicPriceEvidenceUncached(projectId, options);
  if (cache) cache.set(cacheKey, lookup);
  try {
    return await lookup;
  } catch (error) {
    cache?.delete(cacheKey);
    throw error;
  }
}

async function getPublicPriceEvidenceUncached(projectId, options) {
  const tokenUrl = new URL(`${ANNOUNCEMENT_PATH}/generateToken`, EGP_BASE_URL);
  const firstKey = encryptAnnouncementData({ projectId });
  const key = encryptAnnouncementData(firstKey);
  const tokenResponse = await request(tokenUrl, {
    ...options,
    method: "POST",
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      noToken: "noToken",
      noDataProfile: "noDataProfile",
    },
    body: JSON.stringify({ key }),
  });
  const tokenPayload = await readMetadataJson(tokenResponse, "legacy token");
  const token = String(tokenPayload?.data || "").trim();
  if (!token) return null;

  const detailUrl = new URL(
    `${ANNOUNCEMENT_PATH}/getProjectDetail`,
    EGP_BASE_URL
  );
  detailUrl.searchParams.set("projectId", projectId);
  const detailResponse = await request(detailUrl, {
    ...options,
    headers: {
      ...options.headers,
      "X-Announcement-Token": token,
      noToken: "noToken",
      noDataProfile: "noDataProfile",
    },
  });
  const detailPayload = await readMetadataJson(detailResponse, "legacy project");
  const detail = detailPayload?.data;
  if (!detail?.methodId) return null;

  const greenBookUrl = new URL(`${ANNOUNCEMENT_PATH}/greenBook`, EGP_BASE_URL);
  greenBookUrl.searchParams.set(
    "mode",
    detail.isSect7 ? "LINK_SECTION" : "LINK"
  );
  greenBookUrl.searchParams.set("methodId", detail.methodId);
  greenBookUrl.searchParams.set("tempProjectId", projectId);
  if (detail.announceType) {
    greenBookUrl.searchParams.set("pageAnnounceType", detail.announceType);
  }

  // Older projects expose the price ZIP filename in the public green-book list.
  const greenBookResponse = await request(greenBookUrl, {
    ...options,
    headers: {
      ...options.headers,
      "X-Announcement-Token": token,
      noToken: "noToken",
      noDataProfile: "noDataProfile",
    },
  });
  const greenBookPayload = await readMetadataJson(
    greenBookResponse,
    "legacy green-book"
  );
  const records = greenBookPayload?.data?.greenBookAnnouncementTypeLinkDto;
  return { token, detail, greenBookPayload, records };
}

function legacyPriceRecord(records, projectId) {
  if (!Array.isArray(records)) return null;
  return records.find((item) => {
    if (item?.announceType !== "BOQ" || !item?.priceBuildName) return false;
    try {
      validateLegacyFileName(item.priceBuildName, projectId);
      return true;
    } catch (_error) {
      return false;
    }
  });
}

async function getLegacyPriceEstimateMetadata(projectId, options) {
  const evidence = await getPublicPriceEvidence(projectId, options);
  if (!evidence) return null;
  const record = legacyPriceRecord(evidence.records, projectId);
  if (!record) return null;

  return createDocumentMetadata({
    projectId,
    fileName: validateLegacyFileName(record.priceBuildName, projectId),
    lookupMethod: LOOKUP_METHOD.PRICE_LEGACY_GREEN_BOOK,
    downloadMethod: DOWNLOAD_METHOD.LEGACY_FILENAME,
  });
}

function unresolvedChunkError(message) {
  return new EgpServiceError(message, 502, {
    code: "EGP_PRICE_CHUNK_UNRESOLVED",
    kind: ERROR_KIND.INVALID_RESPONSE,
  });
}

async function getChunkedPriceEstimateMetadata(projectId, options) {
  const evidence = await getPublicPriceEvidence(projectId, options);
  if (!evidence) return null;
  const records = evidence.records;
  if (!Array.isArray(records)) return null;
  const record = records.find(
    (item) => item?.announceType === "BOQ" && item?.priceBuildName
  );
  if (!record) return null;
  if (legacyPriceRecord([record], projectId)) return null;

  if (String(evidence.greenBookPayload?.response?.responseCode ?? "") !== "0") {
    throw unresolvedChunkError(
      "e-GP did not confirm a complete Price Estimate document list"
    );
  }
  if (String(record.projectId || "") !== projectId) {
    throw unresolvedChunkError(
      "e-GP Price Estimate evidence belongs to another project"
    );
  }
  const documentId = validateUuidDocumentId(record.priceBuildName);
  const detail = evidence.detail;
  if (
    String(detail?.projectId || "") !== projectId ||
    String(detail?.announceType || "").toUpperCase() !== "BOQ" ||
    String(detail?.projectStatus || "").toUpperCase() !== "A"
  ) {
    throw unresolvedChunkError(
      "e-GP Price Estimate evidence has an unsupported publication state"
    );
  }

  const procurementUrl = new URL(
    `${ANNOUNCEMENT_PATH}/getProcurementDetail`,
    EGP_BASE_URL
  );
  procurementUrl.searchParams.set("projectId", projectId);
  const procurementResponse = await request(procurementUrl, {
    ...options,
    headers: {
      ...options.headers,
      "X-Announcement-Token": evidence.token,
      noToken: "noToken",
      noDataProfile: "noDataProfile",
    },
  });
  const procurementPayload = await readMetadataJson(
    procurementResponse,
    "chunked Price procurement state"
  );
  const procurement = procurementPayload?.data;
  if (
    String(procurementPayload?.response?.responseCode ?? "") !== "0" ||
    String(procurement?.projectId || "") !== projectId ||
    String(procurement?.typeProject || "") !== "9" ||
    String(procurement?.flowAgencyFlag || "").toUpperCase() !== "Y" ||
    String(procurement?.flowAgencyType || "").toUpperCase() !== "A"
  ) {
    throw unresolvedChunkError(
      "e-GP Price Estimate uses an unsupported procurement state"
    );
  }

  const chunkInfo = await getChunkedDocumentInfo(
    projectId,
    documentId,
    options
  );
  return createDocumentMetadata({
    projectId,
    fileId: documentId,
    fileName: chunkInfo.fileName,
    lookupMethod: LOOKUP_METHOD.PRICE_GREEN_BOOK_CHUNK,
    downloadMethod: DOWNLOAD_METHOD.CHUNKED_DOCUMENT,
  });
}

async function discoverPriceEstimateMetadata(projectId, options = {}) {
  const safeProjectId = validateProjectId(projectId);
  const discoveryOptions = {
    ...options,
    metadataCache:
      options.metadataCache instanceof Map ? options.metadataCache : new Map(),
  };
  const attempts = [];
  const strategies = [
    [LOOKUP_METHOD.PRICE_PRIMARY, getPrimaryPriceEstimateMetadata],
    [LOOKUP_METHOD.PRICE_PROJECT_SERVICE, getFallbackPriceEstimateMetadata],
    [LOOKUP_METHOD.PRICE_LEGACY_GREEN_BOOK, getLegacyPriceEstimateMetadata],
    [LOOKUP_METHOD.PRICE_GREEN_BOOK_CHUNK, getChunkedPriceEstimateMetadata],
  ];

  // Each strategy is isolated so a recoverable failure in one undocumented
  // endpoint cannot prevent the next known lookup from being attempted.
  for (const [lookupMethod, strategy] of strategies) {
    try {
      const metadata = await strategy(safeProjectId, discoveryOptions);
      if (metadata) {
        attempts.push({ lookupMethod, outcome: "available" });
        return { ...metadata, lookupAttempts: attempts };
      }
      attempts.push({ lookupMethod, outcome: "not_found" });
    } catch (error) {
      attempts.push({
        lookupMethod,
        outcome: "error",
        code: error.code || "EGP_SERVICE_ERROR",
        kind: error.kind || ERROR_KIND.RECOVERABLE,
      });
      if (
        lookupMethod === LOOKUP_METHOD.PRICE_GREEN_BOOK_CHUNK ||
        !canContinueLookup(error)
      ) {
        error.details = { ...error.details, lookupAttempts: attempts };
        throw error;
      }
    }
  }

  throw new EgpServiceError("No price estimate document found", 422, {
    code: "EGP_DOCUMENT_NOT_FOUND",
    kind: ERROR_KIND.NOT_FOUND,
    details: { lookupAttempts: attempts },
  });
}

function canContinueLookup(error) {
  return [
    ERROR_KIND.CONFIGURATION,
    ERROR_KIND.INVALID_RESPONSE,
    ERROR_KIND.RECOVERABLE,
  ].includes(error?.kind);
}

module.exports = {
  discoverPriceEstimateMetadata,
};

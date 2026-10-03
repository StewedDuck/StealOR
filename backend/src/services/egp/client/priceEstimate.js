const crypto = require("crypto");
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
} = require("./validation");
const { request, readMetadataJson } = require("./transport");
const { createDocumentMetadata } = require("./metadata");

function encryptAnnouncementData(value) {
  const salt = crypto.randomBytes(8);
  const password = Buffer.from("RDCrypto", "utf8");
  let derived = Buffer.alloc(0);
  let previous = Buffer.alloc(0);

  // Match the public e-GP CryptoJS/OpenSSL passphrase format.
  while (derived.length < 48) {
    previous = crypto
      .createHash("md5")
      .update(Buffer.concat([previous, password, salt]))
      .digest();
    derived = Buffer.concat([derived, previous]);
  }

  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    derived.subarray(0, 32),
    derived.subarray(32, 48)
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return encodeURIComponent(
    Buffer.concat([Buffer.from("Salted__"), salt, encrypted]).toString("base64")
  );
}

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

async function getLegacyPriceEstimateMetadata(projectId, options) {
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
  if (!Array.isArray(records)) return null;
  const record = records.find(
    (item) => item?.announceType === "BOQ" && item?.priceBuildName
  );
  if (!record) return null;

  return createDocumentMetadata({
    projectId,
    fileName: validateLegacyFileName(record.priceBuildName, projectId),
    lookupMethod: LOOKUP_METHOD.PRICE_LEGACY_GREEN_BOOK,
    downloadMethod: DOWNLOAD_METHOD.LEGACY_FILENAME,
  });
}

async function discoverPriceEstimateMetadata(projectId, options = {}) {
  const safeProjectId = validateProjectId(projectId);
  const attempts = [];
  const strategies = [
    [LOOKUP_METHOD.PRICE_PRIMARY, getPrimaryPriceEstimateMetadata],
    [LOOKUP_METHOD.PRICE_PROJECT_SERVICE, getFallbackPriceEstimateMetadata],
    [LOOKUP_METHOD.PRICE_LEGACY_GREEN_BOOK, getLegacyPriceEstimateMetadata],
  ];

  // Each strategy is isolated so a recoverable failure in one undocumented
  // endpoint cannot prevent the next known lookup from being attempted.
  for (const [lookupMethod, strategy] of strategies) {
    try {
      const metadata = await strategy(safeProjectId, options);
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
      if (!canContinueLookup(error)) {
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

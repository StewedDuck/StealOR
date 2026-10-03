const crypto = require("crypto");

const EGP_BASE_URL = "https://process5.gprocurement.go.th";
const EGP_LEGACY_BASE_URL = "https://process3.gprocurement.go.th";
const EGP_LEGACY_FILE_BASE_URL = "https://file.gprocurement.go.th";
const ANNOUNCEMENT_PATH =
  "/egp-oann10-service/pb/a-egp-allt-project/announcement";
const APPROVAL_COMMON_PATH = "/egp-approval-service/apv-common";
// Real e-GP price archives can be around 50 MB and the service can stream slowly.
// Keep both values bounded, but high enough for those observed public files.
const DEFAULT_MAX_DOWNLOAD_BYTES = 75 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_RETRY_MAX_DELAY_MS = 2_000;

const DOCUMENT_CATEGORY = Object.freeze({
  DRAFT_EBIDDING: "draft_ebidding",
  INVITATION: "invitation",
  PRICE_ESTIMATE: "price_estimate",
});

const LOOKUP_METHOD = Object.freeze({
  DRAFT_ADJUSTED: "draft_approval_adjusted",
  DRAFT_LEGACY_PUBLIC: "draft_legacy_public",
  DRAFT_TEMP: "draft_approval_temp",
  INVITATION_APPROVAL_FINAL: "invitation_approval_final",
  PRICE_PRIMARY: "price_primary",
  PRICE_PROJECT_SERVICE: "price_project_service",
  PRICE_LEGACY_GREEN_BOOK: "price_legacy_green_book",
});

const DOWNLOAD_METHOD = Object.freeze({
  FILE_ID: "file_id",
  LEGACY_DRAFT_TRANSFER: "legacy_draft_transfer",
  LEGACY_FILENAME: "legacy_filename",
});

const LEGACY_DRAFT_DISCOVERY_PATH =
  "/egp-oann10-service/pb/a-egp-allt-project/announcement/getTorZipList";
const LEGACY_DRAFT_TRANSFER_PATH = "/EGPTransService/control.download";
const LEGACY_DRAFT_TYPES = Object.freeze([
  Object.freeze({ typeId: "03", docType: "temp", stepId: "D03" }),
  Object.freeze({ typeId: "04", docType: "adj", stepId: "U03" }),
]);

const ERROR_KIND = Object.freeze({
  ACCESS_DENIED: "access_denied",
  CONFIGURATION: "configuration_error",
  INVALID_INPUT: "invalid_input",
  INVALID_RESPONSE: "invalid_response",
  NOT_FOUND: "not_found",
  RATE_LIMITED: "rate_limited",
  RECOVERABLE: "recoverable",
});

class EgpServiceError extends Error {
  constructor(message, statusCode = 502, details = {}) {
    super(message);
    this.name = "EgpServiceError";
    this.statusCode = statusCode;
    this.code = details.code || "EGP_SERVICE_ERROR";
    this.kind = details.kind || ERROR_KIND.RECOVERABLE;
    this.upstreamStatus = details.upstreamStatus ?? null;
    this.retryable = Boolean(details.retryable);
    this.details = details.details || {};
  }
}

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

async function request(
  url,
  {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers = {},
    method = "GET",
    body,
    redirect = "follow",
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS,
    sleepImpl = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    randomImpl = Math.random,
  } = {}
) {
  const retries = Math.max(0, Number(maxRetries) || 0);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Accept: "application/json, application/zip, application/octet-stream",
          "User-Agent": "StealOR/1.0 document enrichment",
          ...headers,
        },
        body,
        redirect,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const isTimeout =
        error?.name === "TimeoutError" || error?.name === "AbortError";
      if (isTimeout && attempt < retries) {
        await sleepImpl(retryDelay(attempt, retryBaseDelayMs, retryMaxDelayMs, randomImpl));
        continue;
      }
      throw new EgpServiceError(`Unable to reach e-GP: ${error.message}`, isTimeout ? 504 : 502, {
        code: isTimeout ? "EGP_TIMEOUT" : "EGP_NETWORK_ERROR",
        kind: ERROR_KIND.RECOVERABLE,
        retryable: isTimeout,
      });
    }

    if (response.ok) return response;

    if (response.status >= 500 && attempt < retries) {
      await sleepImpl(retryDelay(attempt, retryBaseDelayMs, retryMaxDelayMs, randomImpl));
      continue;
    }

    throw createHttpError(response.status);
  }

  throw new EgpServiceError("Unable to reach e-GP");
}

function retryDelay(attempt, baseDelayMs, maxDelayMs, randomImpl) {
  const exponential = Math.min(
    Math.max(0, Number(baseDelayMs) || 0) * 2 ** attempt,
    Math.max(0, Number(maxDelayMs) || 0)
  );
  return Math.round(exponential * (0.75 + randomImpl() * 0.5));
}

function createHttpError(status) {
  if (status === 401 || status === 403) {
    return new EgpServiceError(`e-GP responded with HTTP ${status}`, status, {
      code: "EGP_ACCESS_DENIED",
      kind: ERROR_KIND.ACCESS_DENIED,
      upstreamStatus: status,
    });
  }
  if (status === 429) {
    return new EgpServiceError("e-GP responded with HTTP 429", 429, {
      code: "EGP_RATE_LIMITED",
      kind: ERROR_KIND.RATE_LIMITED,
      upstreamStatus: status,
    });
  }
  if (status === 404 || status >= 500) {
    return new EgpServiceError(`e-GP responded with HTTP ${status}`, 502, {
      code: "EGP_HTTP_ERROR",
      kind: ERROR_KIND.RECOVERABLE,
      upstreamStatus: status,
      retryable: status >= 500,
    });
  }
  return new EgpServiceError(`e-GP responded with HTTP ${status}`, 502, {
    code: "EGP_HTTP_ERROR",
    kind: ERROR_KIND.INVALID_RESPONSE,
    upstreamStatus: status,
  });
}

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

async function readMetadataJson(response, sourceName) {
  try {
    return await response.json();
  } catch (error) {
    throw new EgpServiceError(
      `e-GP returned invalid ${sourceName} metadata JSON: ${error.message}`,
      502,
      {
        code: "EGP_INVALID_JSON",
        kind: ERROR_KIND.RECOVERABLE,
      }
    );
  }
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

function buildDocumentDownloadUrl(metadata) {
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

async function getInvitationBiddingDocumentMetadata(projectId, options) {
  const url = new URL(
    `${APPROVAL_COMMON_PATH}/infoProcureDocAnnounZip`,
    EGP_BASE_URL
  );
  url.searchParams.set("projectId", projectId);

  const response = await request(url, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      noToken: "noToken",
      noDataProfile: "noDataProfile",
    },
  });
  const payload = await readMetadataJson(response, "invitation");
  const data = payload?.data;
  if (
    payload?.response?.responseCode !== "0" ||
    !data?.zipId ||
    !data?.buildName1
  ) {
    return createNotFoundMetadata(
      projectId,
      DOCUMENT_CATEGORY.INVITATION,
      LOOKUP_METHOD.INVITATION_APPROVAL_FINAL
    );
  }

  // The public website maps the UI label "เอกสารประกวดราคา" to zipId and
  // buildName1. buildName2 is a template reference for the separate
  // "ประกาศเชิญชวน" PDF and must never be used as this ZIP's file ID.
  return createDocumentMetadata({
    projectId,
    category: DOCUMENT_CATEGORY.INVITATION,
    fileId: validateFileId(data.zipId),
    fileName: validateZipFileName(data.buildName1),
    lookupMethod: LOOKUP_METHOD.INVITATION_APPROVAL_FINAL,
    additionalFields: {
      announcementTemplateId: data.buildName2
        ? validateFileId(data.buildName2)
        : null,
    },
  });
}

async function requestDraftPayload(projectId, endpoint, itemNo, options) {
  const url = new URL(`${APPROVAL_COMMON_PATH}/${endpoint}`, EGP_BASE_URL);
  url.searchParams.set("projectId", projectId);
  if (itemNo !== null) url.searchParams.set("itemNo", String(itemNo));

  const response = await request(url, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      noToken: "noToken",
      noDataProfile: "noDataProfile",
    },
  });
  return readMetadataJson(response, "draft e-bidding");
}

function normalizeDraftCandidate(projectId, record, revision, lookupMethod) {
  if (!record?.zipId || !record?.buildName1) return null;
  return {
    projectId,
    fileId: validateFileId(record.zipId),
    fileName: validateZipFileName(record.buildName1),
    revision,
    lookupMethod,
  };
}

function responseCode(payload) {
  return String(payload?.response?.responseCode ?? "");
}

function isConfirmedProcess5Absence(payload) {
  const code = responseCode(payload);
  const messageCode = String(payload?.response?.messageCode ?? "");
  return (
    code === "1" &&
    payload?.data == null &&
    (messageCode === "" || messageCode === "E0001")
  );
}

function assertSupportedProcess5DraftPayload(payload, { allowArray }) {
  if (isConfirmedProcess5Absence(payload)) return "not_found";
  if (responseCode(payload) !== "0") {
    throw new EgpServiceError("e-GP returned an unsupported Draft response", 502, {
      code: "EGP_INVALID_DRAFT_RESPONSE",
      kind: ERROR_KIND.INVALID_RESPONSE,
    });
  }
  if (allowArray && Array.isArray(payload?.data)) {
    return payload.data.length === 0 ? "not_found" : "available";
  }
  if (!allowArray && payload?.data && typeof payload.data === "object") {
    return "available";
  }
  throw new EgpServiceError("e-GP returned malformed Draft metadata", 502, {
    code: "EGP_INVALID_DRAFT_RESPONSE",
    kind: ERROR_KIND.INVALID_RESPONSE,
  });
}

function selectDraftCandidate(projectId, candidates, reachedRevisionLimit) {
  if (candidates.length === 0) {
    return createNotFoundMetadata(
      projectId,
      DOCUMENT_CATEGORY.DRAFT_EBIDDING,
      LOOKUP_METHOD.DRAFT_TEMP
    );
  }

  // itemNo is the revision selector used by the public website: 0 is the
  // initial Temp document and positive values address adjusted revisions.
  // This is intentionally different from trusting an API array's order.
  const latestRevision = Math.max(...candidates.map(({ revision }) => revision));
  const latestCandidates = candidates.filter(
    ({ revision }) => revision === latestRevision
  );
  const uniqueLatest = new Map(
    latestCandidates.map((candidate) => [
      `${candidate.fileId}\u0000${candidate.fileName}`,
      candidate,
    ])
  );

  if (reachedRevisionLimit || uniqueLatest.size !== 1) {
    return createAmbiguousMetadata(projectId, candidates, {
      latestRevision,
      ambiguityReason: reachedRevisionLimit
        ? "revision_limit_reached"
        : "conflicting_latest_revision",
    });
  }

  const selected = uniqueLatest.values().next().value;
  return createDocumentMetadata({
    projectId,
    category: DOCUMENT_CATEGORY.DRAFT_EBIDDING,
    fileId: selected.fileId,
    fileName: selected.fileName,
    lookupMethod: selected.lookupMethod,
    additionalFields: {
      revision: selected.revision,
      version: selected.revision === 0 ? "initial" : `revision_${selected.revision}`,
      candidateCount: candidates.length,
    },
  });
}

async function getDraftEbiddingMetadata(projectId, options) {
  const candidates = [];
  const attempts = [];
  const initialPayload = await requestDraftPayload(
    projectId,
    "infoProcureDocAnnounZipTemp",
    null,
    options
  );
  const initialOutcome = assertSupportedProcess5DraftPayload(initialPayload, {
    allowArray: false,
  });
  if (initialOutcome === "available") {
    const initial = normalizeDraftCandidate(
      projectId,
      initialPayload.data,
      0,
      LOOKUP_METHOD.DRAFT_TEMP
    );
    if (!initial) {
      throw new EgpServiceError("e-GP returned malformed initial Draft metadata", 502, {
        code: "EGP_INVALID_DRAFT_RESPONSE",
        kind: ERROR_KIND.INVALID_RESPONSE,
      });
    }
    candidates.push(initial);
  }
  attempts.push({ lookupMethod: LOOKUP_METHOD.DRAFT_TEMP, outcome: initialOutcome });

  const maxRevisions = Math.min(
    50,
    Math.max(1, Math.floor(Number(options.maxDraftRevisions) || 20))
  );
  let reachedRevisionLimit = false;
  // The public UI addresses adjusted drafts with contiguous positive itemNo
  // values. Probe sequentially and stop at the first missing revision, with a
  // hard cap so an upstream contract change cannot create an unbounded loop.
  for (let itemNo = 1; itemNo <= maxRevisions; itemNo += 1) {
    const payload = await requestDraftPayload(
      projectId,
      "infoProcureDocAnnounZipAdj",
      itemNo,
      options
    );
    const adjustedOutcome = assertSupportedProcess5DraftPayload(payload, {
      allowArray: true,
    });
    if (adjustedOutcome === "not_found") {
      attempts.push({
        lookupMethod: LOOKUP_METHOD.DRAFT_ADJUSTED,
        outcome: "not_found",
      });
      break;
    }
    const records = payload.data;

    const revisionCandidates = records
      .map((record) =>
        normalizeDraftCandidate(
          projectId,
          record,
          itemNo,
          LOOKUP_METHOD.DRAFT_ADJUSTED
        )
      )
      .filter(Boolean);
    if (revisionCandidates.length !== records.length) {
      throw new EgpServiceError("e-GP returned malformed adjusted Draft metadata", 502, {
        code: "EGP_INVALID_DRAFT_RESPONSE",
        kind: ERROR_KIND.INVALID_RESPONSE,
      });
    }
    attempts.push({
      lookupMethod: LOOKUP_METHOD.DRAFT_ADJUSTED,
      outcome: "available",
    });
    candidates.push(...revisionCandidates);
    reachedRevisionLimit = itemNo === maxRevisions;
  }

  return {
    ...selectDraftCandidate(projectId, candidates, reachedRevisionLimit),
    lookupAttempts: attempts,
  };
}

function invalidLegacyDraftResponse(message) {
  return new EgpServiceError(message, 502, {
    code: "EGP_INVALID_LEGACY_DRAFT_RESPONSE",
    kind: ERROR_KIND.INVALID_RESPONSE,
  });
}

function parseLegacyDraftFileName(fileName, projectId) {
  const normalized = validateZipFileName(fileName);
  const escapedProjectId = projectId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalized.match(
    new RegExp(`^${escapedProjectId}_(\\d{14})_[A-Za-z0-9-]+\\.zip$`, "i")
  );
  if (!match) {
    throw invalidLegacyDraftResponse("e-GP returned an invalid Legacy Draft filename");
  }

  const stamp = match[1];
  const buddhistYear = Number(stamp.slice(0, 4));
  const month = Number(stamp.slice(4, 6));
  const day = Number(stamp.slice(6, 8));
  const hour = Number(stamp.slice(8, 10));
  const minute = Number(stamp.slice(10, 12));
  const second = Number(stamp.slice(12, 14));
  const gregorianYear = buddhistYear - 543;
  const timestampMs = Date.UTC(
    gregorianYear,
    month - 1,
    day,
    hour - 7,
    minute,
    second
  );
  const thailand = new Date(timestampMs + 7 * 60 * 60 * 1000);
  if (
    !Number.isFinite(timestampMs) ||
    thailand.getUTCFullYear() !== gregorianYear ||
    thailand.getUTCMonth() + 1 !== month ||
    thailand.getUTCDate() !== day ||
    thailand.getUTCHours() !== hour ||
    thailand.getUTCMinutes() !== minute ||
    thailand.getUTCSeconds() !== second
  ) {
    throw invalidLegacyDraftResponse("e-GP returned an invalid Legacy Draft timestamp");
  }
  return { fileName: normalized, fileTimestamp: stamp, timestampMs };
}

function normalizeLegacyDraftCandidate(projectId, record, legacyItemNo, queryType) {
  if (!record || typeof record !== "object") {
    throw invalidLegacyDraftResponse("e-GP returned malformed Legacy Draft metadata");
  }
  if (String(record.projectId || "") !== projectId) {
    throw invalidLegacyDraftResponse("e-GP returned a mismatched Legacy Draft project ID");
  }
  const sourceType = LEGACY_DRAFT_TYPES.find(({ stepId }) => stepId === record.stepId);
  if (!sourceType) {
    throw invalidLegacyDraftResponse("e-GP returned an unsupported Legacy Draft step");
  }
  const parsedName = parseLegacyDraftFileName(record.buildName, projectId);
  const publishedAt = new Date(record.webDate);
  if (Number.isNaN(publishedAt.getTime())) {
    throw invalidLegacyDraftResponse("e-GP returned an invalid Legacy Draft publication date");
  }
  const publishedThailand = new Date(publishedAt.getTime() + 7 * 60 * 60 * 1000);
  const fileThailand = new Date(parsedName.timestampMs + 7 * 60 * 60 * 1000);
  if (
    publishedThailand.getUTCFullYear() !== fileThailand.getUTCFullYear() ||
    publishedThailand.getUTCMonth() !== fileThailand.getUTCMonth() ||
    publishedThailand.getUTCDate() !== fileThailand.getUTCDate()
  ) {
    throw invalidLegacyDraftResponse(
      "e-GP returned conflicting Legacy Draft publication timestamps"
    );
  }
  const commentDeadline = record.commentFDate
    ? new Date(record.commentFDate)
    : null;
  if (commentDeadline && Number.isNaN(commentDeadline.getTime())) {
    throw invalidLegacyDraftResponse("e-GP returned an invalid Draft comment deadline");
  }
  return {
    projectId,
    fileId: null,
    fileName: parsedName.fileName,
    fileTimestamp: parsedName.fileTimestamp,
    timestampMs: parsedName.timestampMs,
    publishedAt: publishedAt.toISOString(),
    commentDeadlineAt: commentDeadline?.toISOString() || null,
    lookupMethod: LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC,
    legacyItemNo,
    legacyTypeId: sourceType.typeId,
    legacyDocType: sourceType.docType,
    legacyMethodId: "16",
    legacyStepId: sourceType.stepId,
    queryTypeId: queryType.typeId,
    locatorMatchesSource: queryType.typeId === sourceType.typeId,
  };
}

async function requestLegacyDraftCandidates(projectId, queryType, options) {
  const url = new URL(LEGACY_DRAFT_DISCOVERY_PATH, EGP_BASE_URL);
  for (const [key, value] of Object.entries({
    projectId,
    methodId: "16",
    projectVersion: "3",
    typeProject: "6",
    stepId: "C01",
    typeId: queryType.typeId,
  })) {
    url.searchParams.set(key, value);
  }
  const response = await request(url, {
    ...options,
    headers: { ...options.headers, Accept: "application/json" },
  });
  const payload = await readMetadataJson(response, "Legacy Draft");
  if (responseCode(payload) !== "0" || !Array.isArray(payload?.data)) {
    throw invalidLegacyDraftResponse("e-GP returned an unsupported Legacy Draft response");
  }
  return payload.data.map((record, legacyItemNo) =>
    normalizeLegacyDraftCandidate(projectId, record, legacyItemNo, queryType)
  );
}

function deduplicateLegacyDraftCandidates(candidates) {
  const grouped = new Map();
  for (const candidate of candidates) {
    const group = grouped.get(candidate.fileName) || [];
    group.push(candidate);
    grouped.set(candidate.fileName, group);
  }
  const deduplicated = [];
  for (const group of grouped.values()) {
    const matchingLocators = group.filter(({ locatorMatchesSource }) => locatorMatchesSource);
    if (matchingLocators.length !== 1) {
      throw invalidLegacyDraftResponse(
        "e-GP did not provide one authoritative Legacy Draft download locator"
      );
    }
    deduplicated.push(matchingLocators[0]);
  }
  return deduplicated;
}

function selectLegacyDraftCandidate(projectId, candidates) {
  if (candidates.length === 0) {
    return createNotFoundMetadata(
      projectId,
      DOCUMENT_CATEGORY.DRAFT_EBIDDING,
      LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC
    );
  }
  const latestTimestamp = Math.max(...candidates.map(({ timestampMs }) => timestampMs));
  const latest = candidates.filter(({ timestampMs }) => timestampMs === latestTimestamp);
  if (latest.length !== 1) {
    return createAmbiguousMetadata(projectId, candidates, {
      lookupMethod: LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC,
      latestPublishedAt: new Date(latestTimestamp).toISOString(),
      ambiguityReason: "conflicting_latest_legacy_draft",
    });
  }
  const selected = latest[0];
  const diagnostics = candidates.map(createCandidateDiagnostic);
  return createDocumentMetadata({
    projectId,
    category: DOCUMENT_CATEGORY.DRAFT_EBIDDING,
    fileName: selected.fileName,
    lookupMethod: LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC,
    downloadMethod: DOWNLOAD_METHOD.LEGACY_DRAFT_TRANSFER,
    additionalFields: {
      version: `legacy_${selected.fileTimestamp}`,
      candidateCount: candidates.length,
      candidates: diagnostics,
      publishedAt: selected.publishedAt,
      commentDeadlineAt: selected.commentDeadlineAt,
      legacyItemNo: selected.legacyItemNo,
      legacyTypeId: selected.legacyTypeId,
      legacyDocType: selected.legacyDocType,
      legacyMethodId: selected.legacyMethodId,
      legacyStepId: selected.legacyStepId,
    },
  });
}

async function getLegacyDraftEbiddingMetadata(projectId, options) {
  const candidatesByType = [];
  for (const queryType of LEGACY_DRAFT_TYPES) {
    candidatesByType.push(
      ...(await requestLegacyDraftCandidates(projectId, queryType, options))
    );
  }
  return selectLegacyDraftCandidate(
    projectId,
    deduplicateLegacyDraftCandidates(candidatesByType)
  );
}

async function discoverDraftEbiddingMetadata(projectId, options) {
  const process5 = await getDraftEbiddingMetadata(projectId, options);
  if (process5.status !== "not_found") return process5;

  const attempts = [...(process5.lookupAttempts || [])];
  try {
    const legacy = await getLegacyDraftEbiddingMetadata(projectId, options);
    attempts.push({
      lookupMethod: LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC,
      outcome: legacy.status,
    });
    return { ...legacy, lookupAttempts: attempts };
  } catch (error) {
    attempts.push({
      lookupMethod: LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC,
      outcome: "error",
      code: error.code || "EGP_SERVICE_ERROR",
      kind: error.kind || ERROR_KIND.RECOVERABLE,
    });
    error.details = { ...error.details, lookupAttempts: attempts };
    throw error;
  }
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

function isStaleDocumentReferenceError(error) {
  return (
    error?.code === "EGP_INVALID_FILE_ID" ||
    error?.code === "EGP_INVALID_ZIP" ||
    [404, 410].includes(error?.upstreamStatus)
  );
}

async function readLimitedBody(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new EgpServiceError("The e-GP ZIP exceeds the download size limit", 422);
  }
  if (!response.body) throw new EgpServiceError("e-GP returned an empty download");

  const chunks = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.length;
    if (received > maxBytes) {
      throw new EgpServiceError("The e-GP ZIP exceeds the download size limit", 422);
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadZip(fileId, options = {}) {
  const safeFileId = validateFileId(fileId);
  const url = new URL("/egp-upload-service/v1/downloadFileTest", EGP_BASE_URL);
  url.searchParams.set("fileId", safeFileId);

  const response = await request(url, options);
  let buffer;
  try {
    buffer = await readLimitedBody(
      response,
      options.maxBytes || DEFAULT_MAX_DOWNLOAD_BYTES
    );
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new EgpServiceError("e-GP ZIP download timed out", 504);
    }
    throw error;
  }
  if (buffer.length < 4 || buffer.subarray(0, 2).toString("ascii") !== "PK") {
    throw new EgpServiceError("e-GP download is not a valid ZIP file", 422, {
      code: "EGP_INVALID_ZIP",
      kind: ERROR_KIND.INVALID_RESPONSE,
    });
  }
  return buffer;
}

async function downloadLegacyZip(projectId, fileName, options = {}) {
  const safeProjectId = validateProjectId(projectId);
  const safeFileName = validateLegacyFileName(fileName, safeProjectId);
  const url = new URL(
    "/egp2procmainWeb/FPRO9965AttachServ",
    EGP_LEGACY_BASE_URL
  );
  url.searchParams.set("projectId", safeProjectId);
  url.searchParams.set("fileName", safeFileName);

  const response = await request(url, options);
  const buffer = await readLimitedBody(
    response,
    options.maxBytes || DEFAULT_MAX_DOWNLOAD_BYTES
  );
  if (buffer.length < 4 || buffer.subarray(0, 2).toString("ascii") !== "PK") {
    throw new EgpServiceError("e-GP legacy download is not a valid ZIP file", 422, {
      code: "EGP_INVALID_ZIP",
      kind: ERROR_KIND.INVALID_RESPONSE,
    });
  }
  return buffer;
}

function validateLegacyDraftDownloadMetadata(metadata) {
  const projectId = validateProjectId(metadata?.projectId);
  const fileName = parseLegacyDraftFileName(metadata?.fileName, projectId).fileName;
  const legacyItemNo = Number(metadata?.legacyItemNo);
  if (!Number.isSafeInteger(legacyItemNo) || legacyItemNo < 0) {
    throw new EgpServiceError("Legacy Draft item locator is invalid", 502, {
      code: "EGP_INVALID_LEGACY_DRAFT_LOCATOR",
      kind: ERROR_KIND.INVALID_RESPONSE,
    });
  }

  const type = LEGACY_DRAFT_TYPES.find(
    ({ typeId, docType }) =>
      typeId === String(metadata?.legacyTypeId || "") &&
      docType === String(metadata?.legacyDocType || "")
  );
  if (!type || String(metadata?.legacyMethodId || "") !== "16") {
    throw new EgpServiceError("Legacy Draft transfer metadata is invalid", 502, {
      code: "EGP_INVALID_LEGACY_DRAFT_LOCATOR",
      kind: ERROR_KIND.INVALID_RESPONSE,
    });
  }

  return { projectId, fileName, legacyItemNo, type };
}

async function downloadLegacyDraftZip(metadata, options = {}) {
  const { projectId, fileName, legacyItemNo, type } =
    validateLegacyDraftDownloadMetadata(metadata);
  const form = new URLSearchParams({
    proc_id: "",
    servlet: "",
    service: "D",
    projectId,
    methodId: "16",
    typeId: type.typeId,
    itemNo: String(legacyItemNo),
    subjectNo: "",
    subjectName: "",
    strAdd: "",
    mode: "public",
    seqNo: "",
    docType: type.docType,
    docFlag: "",
    submitTin: "",
    attachSimulate: "",
    fileName,
    partType: "z",
    branchNo: "",
    fieldname: "",
    fieldsize: "",
    num: "",
    realMethodId: "",
    announceSeq: "",
    considerSeqno: "",
  });
  const url = new URL(LEGACY_DRAFT_TRANSFER_PATH, EGP_LEGACY_FILE_BASE_URL);
  const response = await request(url, {
    ...options,
    method: "POST",
    redirect: "manual",
    headers: {
      ...options.headers,
      Accept: "application/zip, application/octet-stream",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const buffer = await readLimitedBody(
    response,
    options.maxBytes || DEFAULT_MAX_DOWNLOAD_BYTES
  );
  if (buffer.length < 4 || buffer.subarray(0, 2).toString("ascii") !== "PK") {
    throw new EgpServiceError(
      "e-GP Legacy Draft download is not a valid ZIP file",
      422,
      {
        code: "EGP_INVALID_ZIP",
        kind: ERROR_KIND.INVALID_RESPONSE,
      }
    );
  }
  return buffer;
}

function createNationalEgpAdapter(defaultOptions = {}) {
  return {
    // Discover only metadata here. Downloading is deliberately separate so
    // callers can cache the reference without fetching a large ZIP archive.
    discoverPriceEstimate(projectId, options = {}) {
      return discoverPriceEstimateMetadata(projectId, {
        ...defaultOptions,
        ...options,
      });
    },

    discoverInvitation(projectId, options = {}) {
      const safeProjectId = validateProjectId(projectId);
      return getInvitationBiddingDocumentMetadata(safeProjectId, {
        ...defaultOptions,
        ...options,
      });
    },

    discoverDraftEbidding(projectId, options = {}) {
      const safeProjectId = validateProjectId(projectId);
      return discoverDraftEbiddingMetadata(safeProjectId, {
        ...defaultOptions,
        ...options,
      });
    },

    // Choose the upstream download mechanism inside the adapter. Services and
    // controllers therefore do not need to understand the Process 3 fallback.
    downloadDocument(metadata, options = {}) {
      const requestOptions = { ...defaultOptions, ...options };
      if (
        metadata?.downloadMethod === DOWNLOAD_METHOD.LEGACY_DRAFT_TRANSFER
      ) {
        return downloadLegacyDraftZip(metadata, requestOptions);
      }
      if (metadata?.downloadMethod === DOWNLOAD_METHOD.LEGACY_FILENAME) {
        return downloadLegacyZip(
          metadata.projectId,
          metadata.fileName,
          requestOptions
        );
      }
      return downloadZip(metadata?.fileId, requestOptions);
    },

    // A stored locator is rediscovered only for evidence of staleness or a
    // wrong file, never for access-denied or rate-limit responses.
    shouldRediscoverAfterDownloadError(error) {
      return isStaleDocumentReferenceError(error);
    },
  };
}

const nationalEgpAdapter = createNationalEgpAdapter();

// Compatibility wrapper retained for current services and tests while the
// application is migrated incrementally to the adapter interface.
function getPriceEstimateMetadata(projectId, options = {}) {
  return nationalEgpAdapter.discoverPriceEstimate(projectId, options);
}

module.exports = {
  DOCUMENT_CATEGORY,
  LOOKUP_METHOD,
  DOWNLOAD_METHOD,
  ERROR_KIND,
  EGP_BASE_URL,
  EgpServiceError,
  validateProjectId,
  createNationalEgpAdapter,
  nationalEgpAdapter,
  getPriceEstimateMetadata,
  downloadZip,
  downloadLegacyDraftZip,
  downloadLegacyZip,
};

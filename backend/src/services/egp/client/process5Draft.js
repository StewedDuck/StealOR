const {
  EGP_BASE_URL,
  APPROVAL_COMMON_PATH,
  DOCUMENT_CATEGORY,
  LOOKUP_METHOD,
} = require("./constants");
const { ERROR_KIND, EgpServiceError } = require("./errors");
const { validateFileId, validateZipFileName } = require("./validation");
const { request, readMetadataJson } = require("./transport");
const {
  createDocumentMetadata,
  createNotFoundMetadata,
  createAmbiguousMetadata,
} = require("./metadata");

async function requestDraftPayload(projectId, endpoint, itemNo, options) {
  const cache = options.metadataCache instanceof Map ? options.metadataCache : null;
  const cacheKey = `process5-draft:${projectId}:${endpoint}:${itemNo ?? ""}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey);

  const lookup = requestDraftPayloadUncached(projectId, endpoint, itemNo, options);
  if (cache) cache.set(cacheKey, lookup);
  try {
    return await lookup;
  } catch (error) {
    cache?.delete(cacheKey);
    throw error;
  }
}

async function requestDraftPayloadUncached(projectId, endpoint, itemNo, options) {
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

function parseProcess5BuildDate(projectId, fileName, revision) {
  const escapedProjectId = projectId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const suffix = revision === 0 ? "" : `_${revision}`;
  const match = String(fileName || "").match(
    new RegExp(
      `^${escapedProjectId}_(\\d{2})(\\d{2})(\\d{4})${suffix}\\.zip$`,
      "i"
    )
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]) - 543;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return year * 10_000 + month * 100 + day;
}

function normalizeDraftCandidate(projectId, record, revision, lookupMethod) {
  if (
    !record?.zipId ||
    !record?.buildName1 ||
    !record?.buildName2 ||
    String(record.projectId || "") !== projectId ||
    (revision > 0 && Number(record.itemNo) !== revision)
  ) {
    return null;
  }
  const fileName = validateZipFileName(record.buildName1);
  const buildDateKey = parseProcess5BuildDate(projectId, fileName, revision);
  if (!buildDateKey) return null;
  return {
    projectId,
    fileId: validateFileId(record.zipId),
    fileName,
    templateId: validateFileId(record.buildName2),
    buildDateKey,
    revision,
    lookupMethod,
  };
}

function bangkokDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value: part }) => [type, part])
  );
  return (
    Number(values.year) * 10_000 +
    Number(values.month) * 100 +
    Number(values.day)
  );
}

function draftRevisionVerificationError(message) {
  return new EgpServiceError(message, 502, {
    code: "EGP_DRAFT_REVISION_UNVERIFIED",
    kind: ERROR_KIND.INVALID_RESPONSE,
  });
}

function activePublicRecord(record, projectId, announceType) {
  return (
    String(record?.projectId || "").trim() === projectId &&
    String(record?.announceType || "").trim().toUpperCase() === announceType &&
    String(record?.announceFlag || "").trim().toUpperCase() === "A"
  );
}

function authoritativeDraftPublication(projectId, publicDocuments) {
  const records = publicDocuments
    .filter((record) => {
      const announceType = String(record?.announceType || "")
        .trim()
        .toUpperCase();
      return (
        activePublicRecord(record, projectId, announceType) &&
        (announceType === "B0" || announceType === "B3") &&
        String(record?.templateType || "").trim().toUpperCase() === "D1"
      );
    })
    .map((record) => ({ record, dateKey: bangkokDateKey(record.announceDate) }));
  if (records.length === 0 || records.some(({ dateKey }) => !dateKey)) {
    throw draftRevisionVerificationError(
      "e-GP returned incomplete Draft publication metadata"
    );
  }
  return records.sort((left, right) => right.dateKey - left.dateKey)[0];
}

function sameCompleteLocator(candidate, record) {
  return (
    candidate.fileId === String(record?.zipId || "").trim() &&
    candidate.fileName === String(record?.buildName1 || "").trim() &&
    candidate.templateId === String(record?.buildName2 || "").trim()
  );
}

async function verifyDraftCandidates(
  projectId,
  candidates,
  publicDocuments,
  options
) {
  if (candidates.length === 0) return candidates;
  if (!Array.isArray(publicDocuments)) {
    throw draftRevisionVerificationError(
      "e-GP did not provide Draft publication metadata"
    );
  }
  const publication = authoritativeDraftPublication(projectId, publicDocuments);
  const afterPublication = candidates.filter(
    ({ buildDateKey }) => buildDateKey > publication.dateKey
  );
  if (afterPublication.length === 0) return candidates;

  const hasPublishedInvitation = publicDocuments.some((record) =>
    activePublicRecord(record, projectId, "D0")
  );
  if (!hasPublishedInvitation) {
    throw draftRevisionVerificationError(
      "e-GP returned a Draft candidate after the authoritative Draft publication"
    );
  }

  const finalPayload = await requestDraftPayload(
    projectId,
    "infoProcureDocAnnounZip",
    null,
    options
  );
  if (
    responseCode(finalPayload) !== "0" ||
    String(finalPayload?.data?.projectId || "") !== projectId ||
    !finalPayload?.data?.zipId ||
    !finalPayload?.data?.buildName1 ||
    !finalPayload?.data?.buildName2
  ) {
    throw draftRevisionVerificationError(
      "e-GP did not provide a verifiable final Invitation locator"
    );
  }
  const aliases = new Set();
  for (const candidate of afterPublication) {
    if (!sameCompleteLocator(candidate, finalPayload.data)) {
      throw draftRevisionVerificationError(
        "e-GP returned an unrecognized post-publication Draft candidate"
      );
    }
    aliases.add(candidate);
  }
  const verified = candidates.filter((candidate) => !aliases.has(candidate));
  if (verified.length === 0) {
    throw draftRevisionVerificationError(
      "e-GP did not return a verifiable Draft revision"
    );
  }
  return verified;
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

async function getDraftEbiddingMetadata(projectId, options, publicDocuments) {
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

  const verifiedCandidates = await verifyDraftCandidates(
    projectId,
    candidates,
    publicDocuments,
    options
  );
  return {
    ...selectDraftCandidate(projectId, verifiedCandidates, reachedRevisionLimit),
    lookupAttempts: attempts,
  };
}

module.exports = {
  getDraftEbiddingMetadata,
  requestDraftPayload,
  responseCode,
};

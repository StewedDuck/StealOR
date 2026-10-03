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

module.exports = {
  getDraftEbiddingMetadata,
  responseCode,
};

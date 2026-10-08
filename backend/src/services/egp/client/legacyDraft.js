const {
  EGP_BASE_URL,
  DOCUMENT_CATEGORY,
  LOOKUP_METHOD,
  DOWNLOAD_METHOD,
  LEGACY_DRAFT_DISCOVERY_PATH,
  LEGACY_DRAFT_TYPES,
} = require("./constants");
const { ERROR_KIND, EgpServiceError } = require("./errors");
const { validateZipFileName } = require("./validation");
const { request, readMetadataJson } = require("./transport");
const {
  createDocumentMetadata,
  createNotFoundMetadata,
  createAmbiguousMetadata,
  createCandidateDiagnostic,
} = require("./metadata");
const { responseCode } = require("./process5Draft");

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

module.exports = {
  getLegacyDraftEbiddingMetadata,
  parseLegacyDraftFileName,
};

const {
  EGP_BASE_URL,
  EGP_LEGACY_BASE_URL,
  EGP_LEGACY_FILE_BASE_URL,
  DEFAULT_MAX_DOWNLOAD_BYTES,
  LEGACY_DRAFT_TRANSFER_PATH,
  LEGACY_DRAFT_TYPES,
} = require("./constants");
const { ERROR_KIND, EgpServiceError } = require("./errors");
const {
  validateProjectId,
  validateFileId,
  validateLegacyFileName,
} = require("./validation");
const { request, readLimitedBody } = require("./transport");
const { parseLegacyDraftFileName } = require("./legacyDraft");

function isStaleDocumentReferenceError(error) {
  return (
    error?.code === "EGP_INVALID_FILE_ID" ||
    error?.code === "EGP_INVALID_ZIP" ||
    [404, 410].includes(error?.upstreamStatus)
  );
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

module.exports = {
  isStaleDocumentReferenceError,
  downloadZip,
  downloadLegacyZip,
  downloadLegacyDraftZip,
};

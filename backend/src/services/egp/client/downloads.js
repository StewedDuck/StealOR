const {
  EGP_BASE_URL,
  EGP_LEGACY_BASE_URL,
  EGP_LEGACY_FILE_BASE_URL,
  CHUNKED_DOCUMENT_PATH,
  DEFAULT_MAX_DOWNLOAD_BYTES,
  LEGACY_DRAFT_TRANSFER_PATH,
  LEGACY_DRAFT_TYPES,
} = require("./constants");
const { ERROR_KIND, EgpServiceError } = require("./errors");
const {
  validateProjectId,
  validateFileId,
  validateUuidDocumentId,
  validateLegacyFileName,
  validateZipFileName,
} = require("./validation");
const { request, readLimitedBody, readMetadataJson } = require("./transport");
const { parseLegacyDraftFileName } = require("./legacyDraft");

const MAX_CHUNK_COUNT = 100;

function invalidChunkDocument(message) {
  return new EgpServiceError(message, 502, {
    code: "EGP_INVALID_CHUNK_DOCUMENT",
    kind: ERROR_KIND.INVALID_RESPONSE,
  });
}

function downloadLimit(options) {
  const maxBytes = Number(options.maxBytes || DEFAULT_MAX_DOWNLOAD_BYTES);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maxBytes must be a positive safe integer");
  }
  return maxBytes;
}

async function getChunkedDocumentInfo(projectId, documentId, options = {}) {
  const safeProjectId = validateProjectId(projectId);
  const safeDocumentId = validateUuidDocumentId(documentId);
  const url = new URL(`${CHUNKED_DOCUMENT_PATH}/download-file-info`, EGP_BASE_URL);
  const response = await request(url, {
    ...options,
    method: "POST",
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      noToken: "noToken",
      noDataProfile: "noDataProfile",
    },
    body: JSON.stringify({ docId: safeDocumentId }),
  });
  const payload = await readMetadataJson(response, "chunked document info");
  if (String(payload?.response?.responseCode ?? "") !== "0") {
    throw invalidChunkDocument("e-GP did not resolve the chunked document");
  }

  const chunkInfo = payload?.data?.chunkInfo;
  if (!chunkInfo || typeof chunkInfo !== "object") {
    throw invalidChunkDocument("e-GP returned incomplete chunk metadata");
  }
  if (String(chunkInfo.projectId || "") !== safeProjectId) {
    throw invalidChunkDocument("e-GP chunk metadata belongs to another project");
  }
  if (validateUuidDocumentId(chunkInfo.docId) !== safeDocumentId) {
    throw invalidChunkDocument("e-GP chunk metadata has a mismatched document ID");
  }
  if (String(chunkInfo.docType || "").trim().toLowerCase() !== "zip") {
    throw invalidChunkDocument("e-GP chunked Price document is not a ZIP");
  }

  const fileName = validateZipFileName(chunkInfo.fileName);
  const chunkCount = Number(chunkInfo.chunkCount);
  const fileSize = Number(chunkInfo.fileSize);
  const maxBytes = downloadLimit(options);
  if (
    !Number.isSafeInteger(chunkCount) ||
    chunkCount < 1 ||
    chunkCount > MAX_CHUNK_COUNT
  ) {
    throw invalidChunkDocument("e-GP returned an invalid chunk count");
  }
  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize < 4 ||
    fileSize > maxBytes ||
    chunkCount > fileSize
  ) {
    throw invalidChunkDocument("e-GP returned an invalid chunked document size");
  }

  return {
    projectId: safeProjectId,
    documentId: safeDocumentId,
    fileName,
    chunkCount,
    fileSize,
  };
}

function decodeChunkData(value, remainingBytes) {
  const encoded = String(value || "");
  if (
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) ||
    Math.floor((encoded.length * 3) / 4) > remainingBytes + 2
  ) {
    throw invalidChunkDocument("e-GP returned invalid chunk data");
  }
  const chunk = Buffer.from(encoded, "base64");
  if (chunk.length === 0 || chunk.length > remainingBytes) {
    throw invalidChunkDocument("e-GP chunk data exceeds the declared size");
  }
  return chunk;
}

async function downloadChunkedZip(metadata, options = {}) {
  const info = await getChunkedDocumentInfo(
    metadata?.projectId,
    metadata?.fileId,
    options
  );
  if (
    metadata?.fileName &&
    String(metadata.fileName).trim() !== info.fileName
  ) {
    throw invalidChunkDocument("Stored chunked document filename is stale");
  }

  const chunks = [];
  let receivedBytes = 0;
  const url = new URL(`${CHUNKED_DOCUMENT_PATH}/download-file`, EGP_BASE_URL);
  for (let chunkNo = 1; chunkNo <= info.chunkCount; chunkNo += 1) {
    const response = await request(url, {
      ...options,
      method: "POST",
      headers: {
        ...options.headers,
        "Content-Type": "application/json",
        noToken: "noToken",
        noDataProfile: "noDataProfile",
      },
      body: JSON.stringify({
        chunkInfoDetail: { chunkNo, docId: info.documentId },
      }),
    });
    const payload = await readMetadataJson(response, "chunked document data");
    if (String(payload?.response?.responseCode ?? "") !== "0") {
      throw invalidChunkDocument("e-GP failed to return a document chunk");
    }
    const detail = payload?.data?.chunkInfoDetail;
    if (
      (detail?.docId &&
        validateUuidDocumentId(detail.docId) !== info.documentId) ||
      (detail?.chunkNo !== undefined && Number(detail.chunkNo) !== chunkNo)
    ) {
      throw invalidChunkDocument("e-GP returned mismatched document chunk metadata");
    }
    const chunk = decodeChunkData(
      detail?.data,
      info.fileSize - receivedBytes
    );
    chunks.push(chunk);
    receivedBytes += chunk.length;
  }

  if (receivedBytes !== info.fileSize) {
    throw invalidChunkDocument("e-GP chunked document size does not match metadata");
  }
  const buffer = Buffer.concat(chunks, receivedBytes);
  if (buffer.length < 4 || buffer.subarray(0, 2).toString("ascii") !== "PK") {
    throw new EgpServiceError("e-GP chunked download is not a valid ZIP file", 422, {
      code: "EGP_INVALID_ZIP",
      kind: ERROR_KIND.INVALID_RESPONSE,
    });
  }
  return buffer;
}

function isStaleDocumentReferenceError(error) {
  return (
    error?.code === "EGP_INVALID_FILE_ID" ||
    error?.code === "EGP_INVALID_CHUNK_DOCUMENT" ||
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
  MAX_CHUNK_COUNT,
  getChunkedDocumentInfo,
  downloadChunkedZip,
  isStaleDocumentReferenceError,
  downloadZip,
  downloadLegacyZip,
  downloadLegacyDraftZip,
};

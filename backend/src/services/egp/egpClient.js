const EGP_BASE_URL = "https://process5.gprocurement.go.th";
// Real e-GP price archives can be around 50 MB and the service can stream slowly.
// Keep both values bounded, but high enough for those observed public files.
const DEFAULT_MAX_DOWNLOAD_BYTES = 75 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

class EgpServiceError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "EgpServiceError";
    this.statusCode = statusCode;
  }
}

function validateProjectId(projectId) {
  const normalized = String(projectId || "").trim();
  if (!/^\d{11}$/.test(normalized)) {
    throw new EgpServiceError("Project ID must contain exactly 11 digits", 400);
  }
  return normalized;
}

function validateFileId(fileId) {
  const normalized = String(fileId || "").trim();
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(normalized)) {
    throw new EgpServiceError("e-GP returned an invalid file ID");
  }
  return normalized;
}

async function request(url, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/json, application/zip, application/octet-stream",
        "User-Agent": "StealOR/1.0 document enrichment",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new EgpServiceError(`Unable to reach e-GP: ${error.message}`);
  }

  if (!response.ok) {
    throw new EgpServiceError(`e-GP responded with HTTP ${response.status}`);
  }
  return response;
}

async function getPriceEstimateMetadata(projectId, options = {}) {
  const safeProjectId = validateProjectId(projectId);
  const url = new URL(
    "/egp-doc-price-estimate-service/dpe-common/infoDocPriceestZipHis",
    EGP_BASE_URL
  );
  url.searchParams.set("projectId", safeProjectId);

  const response = await request(url, options);
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new EgpServiceError(`e-GP returned invalid metadata JSON: ${error.message}`);
  }

  if (payload?.response?.responseCode !== "0" || !payload?.data?.zipFileId) {
    throw new EgpServiceError("No price estimate document found", 422);
  }

  return {
    projectId: safeProjectId,
    fileId: validateFileId(payload.data.zipFileId),
    fileName: String(payload.data.zipFileName || `${safeProjectId}.zip`),
  };
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
    throw new EgpServiceError("e-GP download is not a valid ZIP file", 422);
  }
  return buffer;
}

module.exports = {
  EGP_BASE_URL,
  EgpServiceError,
  validateProjectId,
  getPriceEstimateMetadata,
  downloadZip,
};

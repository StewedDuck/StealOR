const {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BASE_DELAY_MS,
  DEFAULT_RETRY_MAX_DELAY_MS,
} = require("./constants");
const { ERROR_KIND, EgpServiceError, createHttpError } = require("./errors");

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

module.exports = {
  request,
  retryDelay,
  readMetadataJson,
  readLimitedBody,
};

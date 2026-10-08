const {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BASE_DELAY_MS,
  DEFAULT_RETRY_MAX_DELAY_MS,
  DEFAULT_RATE_LIMIT_RETRIES,
  DEFAULT_RATE_LIMIT_EXHAUSTION_RECOVERY_RETRIES,
  DEFAULT_RATE_LIMIT_RETRY_BASE_DELAY_MS,
  DEFAULT_RATE_LIMIT_RETRY_MAX_DELAY_MS,
  DEFAULT_REQUEST_MIN_INTERVAL_MS,
  DEFAULT_REQUEST_MAX_INTERVAL_MS,
  DEFAULT_RATE_LIMIT_COOLDOWN_BASE_MS,
  DEFAULT_RATE_LIMIT_COOLDOWN_MAX_MS,
  DEFAULT_RATE_LIMIT_RECOVERY_SUCCESSES,
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
    maxRateLimitRetries = DEFAULT_RATE_LIMIT_RETRIES,
    maxRateLimitExhaustionRecoveryRetries =
      DEFAULT_RATE_LIMIT_EXHAUSTION_RECOVERY_RETRIES,
    rateLimitRetryBaseDelayMs = DEFAULT_RATE_LIMIT_RETRY_BASE_DELAY_MS,
    rateLimitRetryMaxDelayMs = DEFAULT_RATE_LIMIT_RETRY_MAX_DELAY_MS,
    requestCoordinator = null,
    requestPacer = null,
    sleepImpl = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    randomImpl = Math.random,
  } = {}
) {
  const retries = Math.max(0, Number(maxRetries) || 0);
  const rateLimitRetries = Math.max(0, Number(maxRateLimitRetries) || 0);
  const exhaustionRecoveryRetries = Math.max(
    0,
    Number(maxRateLimitExhaustionRecoveryRetries) || 0
  );
  const coordinator = requestCoordinator || requestPacer;
  const endpoint = requestEndpoint(url, method);
  let retryAttempt = 0;
  let rateLimitAttempt = 0;
  let exhaustionRecoveryAttempt = 0;

  while (true) {
    let response;
    try {
      if (coordinator) await coordinator.wait();
      coordinator?.recordRequest?.();
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
      if (isTimeout && retryAttempt < retries) {
        await sleepImpl(
          retryDelay(
            retryAttempt,
            retryBaseDelayMs,
            retryMaxDelayMs,
            randomImpl
          )
        );
        retryAttempt += 1;
        continue;
      }
      throw new EgpServiceError(`Unable to reach e-GP: ${error.message}`, isTimeout ? 504 : 502, {
        code: isTimeout ? "EGP_TIMEOUT" : "EGP_NETWORK_ERROR",
        kind: ERROR_KIND.RECOVERABLE,
        retryable: isTimeout,
      });
    }

    if (response.status === 429 || (await hasRateLimitBody(response))) {
      coordinator?.recordRateLimit?.({ endpoint });
      if (rateLimitAttempt < rateLimitRetries) {
        coordinator?.recordRateLimitRetry?.();
        if (!coordinator?.recordRateLimit) {
          await sleepImpl(
            retryDelay(
              rateLimitAttempt,
              rateLimitRetryBaseDelayMs,
              rateLimitRetryMaxDelayMs,
              randomImpl
            )
          );
        }
        rateLimitAttempt += 1;
        continue;
      }
      if (
        coordinator?.recordRateLimit &&
        exhaustionRecoveryAttempt < exhaustionRecoveryRetries
      ) {
        coordinator.recordRateLimitRetry?.();
        coordinator.recordExhaustionRecoveryAttempt?.({ endpoint });
        exhaustionRecoveryAttempt += 1;
        continue;
      }
      coordinator?.recordRetryExhaustion?.({ endpoint });
      throw new EgpServiceError("e-GP rate limit exceeded", 429, {
        code: "EGP_RATE_LIMITED",
        kind: ERROR_KIND.RATE_LIMITED,
        upstreamStatus: response.status,
        upstreamEndpoint: endpoint,
        retryable: true,
      });
    }

    if (response.ok) {
      coordinator?.recordSuccess?.({
        recovered: rateLimitAttempt > 0 || exhaustionRecoveryAttempt > 0,
        exhaustionRecovered: exhaustionRecoveryAttempt > 0,
      });
      return response;
    }

    if (response.status >= 500 && retryAttempt < retries) {
      await sleepImpl(
        retryDelay(
          retryAttempt,
          retryBaseDelayMs,
          retryMaxDelayMs,
          randomImpl
        )
      );
      retryAttempt += 1;
      continue;
    }

    throw createHttpError(response.status);
  }

}

async function hasRateLimitBody(response) {
  if (response.status !== 200) return false;
  const contentType = String(response.headers.get("content-type") || "")
    .toLowerCase();
  const declaredLength = response.headers.get("content-length");
  const contentLength = declaredLength === null ? NaN : Number(declaredLength);
  const isText =
    contentType.includes("text/plain") || contentType.includes("text/html");
  const isJson = contentType.includes("application/json");
  const isSmallUnknownBody =
    !contentType && Number.isFinite(contentLength) && contentLength <= 1_024;
  if (!isText && !isJson && !isSmallUnknownBody) return false;
  const body = await response.clone().text().catch(() => "");
  return /rate\s*limit\s*exceeded(?:\.\s*try\s*again\s*later\.?)?/i.test(body);
}

function createEgpRequestCoordinator({
  minIntervalMs = DEFAULT_REQUEST_MIN_INTERVAL_MS,
  maxIntervalMs = DEFAULT_REQUEST_MAX_INTERVAL_MS,
  cooldownBaseMs = DEFAULT_RATE_LIMIT_COOLDOWN_BASE_MS,
  cooldownMaxMs = DEFAULT_RATE_LIMIT_COOLDOWN_MAX_MS,
  recoverySuccesses = DEFAULT_RATE_LIMIT_RECOVERY_SUCCESSES,
  sleepImpl = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  nowImpl = Date.now,
  randomImpl = Math.random,
} = {}) {
  const baseInterval = boundedInteger(minIntervalMs, "minIntervalMs", 60_000);
  const maximumInterval = boundedInteger(
    maxIntervalMs,
    "maxIntervalMs",
    60_000
  );
  const baseCooldown = boundedInteger(
    cooldownBaseMs,
    "cooldownBaseMs",
    10 * 60_000
  );
  const maximumCooldown = boundedInteger(
    cooldownMaxMs,
    "cooldownMaxMs",
    10 * 60_000
  );
  const successesForRecovery = boundedInteger(
    recoverySuccesses,
    "recoverySuccesses",
    1_000,
    1
  );
  if (maximumInterval < baseInterval) {
    throw new TypeError("maxIntervalMs must be greater than or equal to minIntervalMs");
  }
  if (maximumCooldown < baseCooldown) {
    throw new TypeError("cooldownMaxMs must be greater than or equal to cooldownBaseMs");
  }
  let queue = Promise.resolve();
  let nextRequestAt = 0;
  let cooldownUntil = 0;
  let currentIntervalMs = baseInterval;
  let consecutiveRateLimits = 0;
  let successfulRecoveryStreak = 0;
  const metrics = {
    egpRequestsTotal: 0,
    rateLimitResponses: 0,
    rateLimitRetries: 0,
    successfulRetries: 0,
    retryExhaustionCount: 0,
    globalCooldownCount: 0,
    globalCooldownMs: 0,
    maxConsecutiveRateLimits: 0,
    exhaustionRecoveryAttempts: 0,
    successfulExhaustionRecoveries: 0,
    rateLimitResponsesByEndpoint: {},
    retryExhaustionsByEndpoint: {},
  };

  const coordinator = {
    wait() {
      const turn = queue.then(async () => {
        const now = nowImpl();
        const delayMs = Math.max(
          0,
          nextRequestAt - now,
          cooldownUntil - now
        );
        if (delayMs > 0) await sleepImpl(delayMs);
        nextRequestAt =
          Math.max(nextRequestAt, cooldownUntil, nowImpl()) + currentIntervalMs;
      });
      queue = turn.catch(() => {});
      return turn;
    },
    recordRequest() {
      metrics.egpRequestsTotal += 1;
    },
    recordRateLimit({ endpoint = "unknown" } = {}) {
      metrics.rateLimitResponses += 1;
      incrementCounter(metrics.rateLimitResponsesByEndpoint, endpoint);
      consecutiveRateLimits += 1;
      successfulRecoveryStreak = 0;
      metrics.maxConsecutiveRateLimits = Math.max(
        metrics.maxConsecutiveRateLimits,
        consecutiveRateLimits
      );
      currentIntervalMs = Math.min(
        maximumInterval,
        Math.max(baseInterval, currentIntervalMs * 2)
      );
      const exponentialCooldown = Math.min(
        maximumCooldown,
        baseCooldown * 3 ** (consecutiveRateLimits - 1)
      );
      const cooldownMs = retryDelay(
        0,
        exponentialCooldown,
        exponentialCooldown,
        randomImpl
      );
      const now = nowImpl();
      cooldownUntil = Math.max(cooldownUntil, now + cooldownMs);
      metrics.globalCooldownCount += 1;
      metrics.globalCooldownMs += cooldownMs;
    },
    recordRateLimitRetry() {
      metrics.rateLimitRetries += 1;
    },
    recordExhaustionRecoveryAttempt() {
      metrics.exhaustionRecoveryAttempts += 1;
    },
    recordRetryExhaustion({ endpoint = "unknown" } = {}) {
      metrics.retryExhaustionCount += 1;
      incrementCounter(metrics.retryExhaustionsByEndpoint, endpoint);
    },
    recordSuccess({ recovered = false, exhaustionRecovered = false } = {}) {
      if (recovered) metrics.successfulRetries += 1;
      if (exhaustionRecovered) metrics.successfulExhaustionRecoveries += 1;
      successfulRecoveryStreak += 1;
      if (successfulRecoveryStreak < successesForRecovery) return;
      currentIntervalMs = Math.max(
        baseInterval,
        Math.floor(currentIntervalMs / 2)
      );
      successfulRecoveryStreak = 0;
      if (currentIntervalMs === baseInterval) consecutiveRateLimits = 0;
    },
    getDiagnostics() {
      return {
        ...metrics,
        rateLimitResponsesByEndpoint: {
          ...metrics.rateLimitResponsesByEndpoint,
        },
        retryExhaustionsByEndpoint: {
          ...metrics.retryExhaustionsByEndpoint,
        },
        baseRequestIntervalMs: baseInterval,
        currentRequestIntervalMs: currentIntervalMs,
        maxRequestIntervalMs: maximumInterval,
        cooldownRemainingMs: Math.max(0, cooldownUntil - nowImpl()),
      };
    },
  };
  return coordinator;
}

function requestEndpoint(url, method) {
  const parsed = url instanceof URL ? url : new URL(url);
  return `${String(method || "GET").toUpperCase()} ${parsed.pathname}`;
}

function incrementCounter(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function createRequestPacer(options = {}) {
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_REQUEST_MIN_INTERVAL_MS;
  return createEgpRequestCoordinator({
    ...options,
    minIntervalMs,
    maxIntervalMs: options.maxIntervalMs ?? minIntervalMs,
    cooldownBaseMs: options.cooldownBaseMs ?? 0,
    cooldownMaxMs: options.cooldownMaxMs ?? 0,
  });
}

function boundedInteger(value, name, maximum, minimum = 0) {
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
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
  createEgpRequestCoordinator,
  createRequestPacer,
  hasRateLimitBody,
  request,
  retryDelay,
  readMetadataJson,
  readLimitedBody,
};

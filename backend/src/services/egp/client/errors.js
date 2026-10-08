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
    this.upstreamEndpoint = details.upstreamEndpoint ?? null;
    this.retryable = Boolean(details.retryable);
    this.details = details.details || {};
  }
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

module.exports = {
  ERROR_KIND,
  EgpServiceError,
  createHttpError,
};

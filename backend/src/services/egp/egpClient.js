const {
  EGP_BASE_URL,
  DOCUMENT_CATEGORY,
  LOOKUP_METHOD,
  DOWNLOAD_METHOD,
  DEFAULT_RATE_LIMIT_RETRIES,
  DEFAULT_RATE_LIMIT_EXHAUSTION_RECOVERY_RETRIES,
  DEFAULT_RATE_LIMIT_RETRY_BASE_DELAY_MS,
  DEFAULT_RATE_LIMIT_RETRY_MAX_DELAY_MS,
  DEFAULT_REQUEST_MIN_INTERVAL_MS,
  DEFAULT_REQUEST_MAX_INTERVAL_MS,
  DEFAULT_RATE_LIMIT_COOLDOWN_BASE_MS,
  DEFAULT_RATE_LIMIT_COOLDOWN_MAX_MS,
  DEFAULT_RATE_LIMIT_RECOVERY_SUCCESSES,
} = require("./client/constants");
const {
  ERROR_KIND,
  EgpServiceError,
} = require("./client/errors");
const {
  validateProjectId,
} = require("./client/validation");
const {
  discoverPriceEstimateMetadata,
} = require("./client/priceEstimate");
const {
  getInvitationBiddingDocumentMetadata,
} = require("./client/invitation");
const {
  discoverDraftEbiddingMetadata,
} = require("./client/draftDiscovery");
const {
  isStaleDocumentReferenceError,
  downloadZip,
  downloadLegacyZip,
  downloadLegacyDraftZip,
} = require("./client/downloads");
const { createEgpRequestCoordinator } = require("./client/transport");

function configuredInteger(value, name, maximum = 60_000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw new TypeError(`${name} must be an integer from 0 to ${maximum}`);
  }
  return parsed;
}

function createNationalEgpAdapter(defaultOptions = {}) {
  const configuredInterval = configuredInteger(
    defaultOptions.minRequestIntervalMs ??
      process.env.EGP_REQUEST_MIN_INTERVAL_MS ??
      DEFAULT_REQUEST_MIN_INTERVAL_MS,
    "minRequestIntervalMs"
  );
  const configuredOptions = {
    ...defaultOptions,
    maxRateLimitRetries: configuredInteger(
      defaultOptions.maxRateLimitRetries ??
        process.env.EGP_RATE_LIMIT_RETRIES ??
        DEFAULT_RATE_LIMIT_RETRIES,
      "maxRateLimitRetries",
      20
    ),
    maxRateLimitExhaustionRecoveryRetries: configuredInteger(
      defaultOptions.maxRateLimitExhaustionRecoveryRetries ??
        process.env.EGP_RATE_LIMIT_EXHAUSTION_RECOVERY_RETRIES ??
        DEFAULT_RATE_LIMIT_EXHAUSTION_RECOVERY_RETRIES,
      "maxRateLimitExhaustionRecoveryRetries",
      5
    ),
    rateLimitRetryBaseDelayMs: configuredInteger(
      defaultOptions.rateLimitRetryBaseDelayMs ??
        process.env.EGP_RATE_LIMIT_RETRY_BASE_DELAY_MS ??
        DEFAULT_RATE_LIMIT_RETRY_BASE_DELAY_MS,
      "rateLimitRetryBaseDelayMs"
    ),
    rateLimitRetryMaxDelayMs: configuredInteger(
      defaultOptions.rateLimitRetryMaxDelayMs ??
        process.env.EGP_RATE_LIMIT_RETRY_MAX_DELAY_MS ??
        DEFAULT_RATE_LIMIT_RETRY_MAX_DELAY_MS,
      "rateLimitRetryMaxDelayMs"
    ),
  };
  const configuredMaxInterval = configuredInteger(
    defaultOptions.maxRequestIntervalMs ??
      process.env.EGP_REQUEST_MAX_INTERVAL_MS ??
      DEFAULT_REQUEST_MAX_INTERVAL_MS,
    "maxRequestIntervalMs"
  );
  const configuredCooldownBase = configuredInteger(
    defaultOptions.rateLimitCooldownBaseMs ??
      process.env.EGP_RATE_LIMIT_COOLDOWN_BASE_MS ??
      DEFAULT_RATE_LIMIT_COOLDOWN_BASE_MS,
    "rateLimitCooldownBaseMs",
    10 * 60_000
  );
  const configuredCooldownMax = configuredInteger(
    defaultOptions.rateLimitCooldownMaxMs ??
      process.env.EGP_RATE_LIMIT_COOLDOWN_MAX_MS ??
      DEFAULT_RATE_LIMIT_COOLDOWN_MAX_MS,
    "rateLimitCooldownMaxMs",
    10 * 60_000
  );
  const configuredRecoverySuccesses = configuredInteger(
    defaultOptions.rateLimitRecoverySuccesses ??
      process.env.EGP_RATE_LIMIT_RECOVERY_SUCCESSES ??
      DEFAULT_RATE_LIMIT_RECOVERY_SUCCESSES,
    "rateLimitRecoverySuccesses",
    1_000
  );
  const pacingExplicitlyConfigured =
    defaultOptions.minRequestIntervalMs !== undefined ||
    process.env.EGP_REQUEST_MIN_INTERVAL_MS !== undefined;
  const shouldPaceDefaultOptions =
    !defaultOptions.fetchImpl || pacingExplicitlyConfigured;
  const sharedRequestCoordinator = shouldPaceDefaultOptions
    ? configuredOptions.requestCoordinator ||
      configuredOptions.requestPacer ||
      createEgpRequestCoordinator({
        minIntervalMs: configuredInterval,
        maxIntervalMs: configuredMaxInterval,
        cooldownBaseMs: configuredCooldownBase,
        cooldownMaxMs: configuredCooldownMax,
        recoverySuccesses: configuredRecoverySuccesses,
        sleepImpl: configuredOptions.pacingSleepImpl,
        nowImpl: configuredOptions.nowImpl,
        randomImpl: configuredOptions.randomImpl,
      })
    : null;

  function mergeRequestOptions(options) {
    const callOverridesFetch =
      options.fetchImpl && options.fetchImpl !== configuredOptions.fetchImpl;
    return {
      ...configuredOptions,
      ...options,
      requestCoordinator:
        options.requestCoordinator ??
        options.requestPacer ??
        (callOverridesFetch && options.minRequestIntervalMs === undefined
          ? null
          : sharedRequestCoordinator),
    };
  }

  return {
    // Discover only metadata here. Downloading is deliberately separate so
    // callers can cache the reference without fetching a large ZIP archive.
    discoverPriceEstimate(projectId, options = {}) {
      return discoverPriceEstimateMetadata(
        projectId,
        mergeRequestOptions(options)
      );
    },

    discoverInvitation(projectId, options = {}) {
      const safeProjectId = validateProjectId(projectId);
      return getInvitationBiddingDocumentMetadata(
        safeProjectId,
        mergeRequestOptions(options)
      );
    },

    discoverDraftEbidding(projectId, options = {}) {
      const safeProjectId = validateProjectId(projectId);
      return discoverDraftEbiddingMetadata(
        safeProjectId,
        mergeRequestOptions(options)
      );
    },

    // Choose the upstream download mechanism inside the adapter. Services and
    // controllers therefore do not need to understand the Process 3 fallback.
    downloadDocument(metadata, options = {}) {
      const requestOptions = mergeRequestOptions(options);
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

    getRequestDiagnostics() {
      return sharedRequestCoordinator?.getDiagnostics?.() || null;
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

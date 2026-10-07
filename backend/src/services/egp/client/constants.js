const EGP_BASE_URL = "https://process5.gprocurement.go.th";
const EGP_LEGACY_BASE_URL = "https://process3.gprocurement.go.th";
const EGP_LEGACY_FILE_BASE_URL = "https://file.gprocurement.go.th";
const ANNOUNCEMENT_PATH =
  "/egp-oann10-service/pb/a-egp-allt-project/announcement";
const APPROVAL_COMMON_PATH = "/egp-approval-service/apv-common";
const CHUNKED_DOCUMENT_PATH = "/egp-aobj19-service/pb/chunk-ext";

// Real e-GP price archives can be around 50 MB and the service can stream slowly.
// Keep both values bounded, but high enough for those observed public files.
const DEFAULT_MAX_DOWNLOAD_BYTES = 75 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_RETRY_MAX_DELAY_MS = 2_000;
const DEFAULT_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_EXHAUSTION_RECOVERY_RETRIES = 1;
const DEFAULT_RATE_LIMIT_RETRY_BASE_DELAY_MS = 1_000;
const DEFAULT_RATE_LIMIT_RETRY_MAX_DELAY_MS = 8_000;
const DEFAULT_REQUEST_MIN_INTERVAL_MS = 500;
const DEFAULT_REQUEST_MAX_INTERVAL_MS = 4_000;
const DEFAULT_RATE_LIMIT_COOLDOWN_BASE_MS = 10_000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MAX_MS = 60_000;
const DEFAULT_RATE_LIMIT_RECOVERY_SUCCESSES = 10;

const DOCUMENT_CATEGORY = Object.freeze({
  DRAFT_EBIDDING: "draft_ebidding",
  INVITATION: "invitation",
  PRICE_ESTIMATE: "price_estimate",
});

const LOOKUP_METHOD = Object.freeze({
  DRAFT_ADJUSTED: "draft_approval_adjusted",
  DRAFT_LEGACY_PUBLIC: "draft_legacy_public",
  DRAFT_PUBLIC_CATEGORY: "draft_public_category",
  DRAFT_TEMP: "draft_approval_temp",
  INVITATION_APPROVAL_FINAL: "invitation_approval_final",
  PRICE_PRIMARY: "price_primary",
  PRICE_PROJECT_SERVICE: "price_project_service",
  PRICE_LEGACY_GREEN_BOOK: "price_legacy_green_book",
  PRICE_GREEN_BOOK_CHUNK: "price_green_book_chunk",
});

const DOWNLOAD_METHOD = Object.freeze({
  FILE_ID: "file_id",
  CHUNKED_DOCUMENT: "chunked_document",
  LEGACY_DRAFT_TRANSFER: "legacy_draft_transfer",
  LEGACY_FILENAME: "legacy_filename",
});

const LEGACY_DRAFT_DISCOVERY_PATH =
  "/egp-oann10-service/pb/a-egp-allt-project/announcement/getTorZipList";
const LEGACY_DRAFT_TRANSFER_PATH = "/EGPTransService/control.download";
const LEGACY_DRAFT_TYPES = Object.freeze([
  Object.freeze({ typeId: "03", docType: "temp", stepId: "D03" }),
  Object.freeze({ typeId: "04", docType: "adj", stepId: "U03" }),
]);

module.exports = {
  EGP_BASE_URL,
  EGP_LEGACY_BASE_URL,
  EGP_LEGACY_FILE_BASE_URL,
  ANNOUNCEMENT_PATH,
  APPROVAL_COMMON_PATH,
  CHUNKED_DOCUMENT_PATH,
  DEFAULT_MAX_DOWNLOAD_BYTES,
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
  DOCUMENT_CATEGORY,
  LOOKUP_METHOD,
  DOWNLOAD_METHOD,
  LEGACY_DRAFT_DISCOVERY_PATH,
  LEGACY_DRAFT_TRANSFER_PATH,
  LEGACY_DRAFT_TYPES,
};

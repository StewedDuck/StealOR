const EGP_BASE_URL = "https://process5.gprocurement.go.th";
const EGP_LEGACY_BASE_URL = "https://process3.gprocurement.go.th";
const EGP_LEGACY_FILE_BASE_URL = "https://file.gprocurement.go.th";
const ANNOUNCEMENT_PATH =
  "/egp-oann10-service/pb/a-egp-allt-project/announcement";
const APPROVAL_COMMON_PATH = "/egp-approval-service/apv-common";

// Real e-GP price archives can be around 50 MB and the service can stream slowly.
// Keep both values bounded, but high enough for those observed public files.
const DEFAULT_MAX_DOWNLOAD_BYTES = 75 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_RETRY_MAX_DELAY_MS = 2_000;

const DOCUMENT_CATEGORY = Object.freeze({
  DRAFT_EBIDDING: "draft_ebidding",
  INVITATION: "invitation",
  PRICE_ESTIMATE: "price_estimate",
});

const LOOKUP_METHOD = Object.freeze({
  DRAFT_ADJUSTED: "draft_approval_adjusted",
  DRAFT_LEGACY_PUBLIC: "draft_legacy_public",
  DRAFT_TEMP: "draft_approval_temp",
  INVITATION_APPROVAL_FINAL: "invitation_approval_final",
  PRICE_PRIMARY: "price_primary",
  PRICE_PROJECT_SERVICE: "price_project_service",
  PRICE_LEGACY_GREEN_BOOK: "price_legacy_green_book",
});

const DOWNLOAD_METHOD = Object.freeze({
  FILE_ID: "file_id",
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
  DEFAULT_MAX_DOWNLOAD_BYTES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BASE_DELAY_MS,
  DEFAULT_RETRY_MAX_DELAY_MS,
  DOCUMENT_CATEGORY,
  LOOKUP_METHOD,
  DOWNLOAD_METHOD,
  LEGACY_DRAFT_DISCOVERY_PATH,
  LEGACY_DRAFT_TRANSFER_PATH,
  LEGACY_DRAFT_TYPES,
};

const {
  EGP_BASE_URL,
  APPROVAL_COMMON_PATH,
  DOCUMENT_CATEGORY,
  LOOKUP_METHOD,
} = require("./constants");
const { validateFileId, validateZipFileName } = require("./validation");
const { request, readMetadataJson } = require("./transport");
const { ERROR_KIND, EgpServiceError } = require("./errors");
const { requestDraftPayload } = require("./process5Draft");
const {
  getPublicAnnouncementDocumentList,
} = require("./publicAnnouncement");
const {
  createDocumentMetadata,
  createNotFoundMetadata,
} = require("./metadata");

async function getInvitationBiddingDocumentMetadata(projectId, options) {
  const url = new URL(
    `${APPROVAL_COMMON_PATH}/infoProcureDocAnnounZip`,
    EGP_BASE_URL
  );
  url.searchParams.set("projectId", projectId);

  const response = await request(url, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      noToken: "noToken",
      noDataProfile: "noDataProfile",
    },
  });
  const payload = await readMetadataJson(response, "invitation");
  const data = payload?.data;

  // infoProcureDocAnnounZip can mirror the initial Draft Temp locator. Always
  // collect that locator for category correlation, even when both ZIPs differ.
  const draftTempPayload = await requestDraftPayload(
    projectId,
    "infoProcureDocAnnounZipTemp",
    null,
    options
  );
  const sharedWithDraftTemp = sameLocator(data, draftTempPayload?.data);

  // greenBook is the complete document list rendered by the public website.
  // D0 is its machine-readable Invitation/announcement category.
  const publicDocuments = await getPublicAnnouncementDocumentList(
    projectId,
    options
  );
  const hasInvitationCategory = publicDocuments.some(
    (record) => record?.announceType === "D0"
  );
  const confirmedCategoryConflict =
    sharedWithDraftTemp && !hasInvitationCategory;
  if (confirmedCategoryConflict || !hasInvitationCategory) {
    return createNotFoundMetadata(
      projectId,
      DOCUMENT_CATEGORY.INVITATION,
      LOOKUP_METHOD.INVITATION_APPROVAL_FINAL
    );
  }

  if (
    String(payload?.response?.responseCode ?? "") !== "0" ||
    !data?.zipId ||
    !data?.buildName1
  ) {
    throw new EgpServiceError(
      "e-GP lists an Invitation document but returned incomplete ZIP metadata",
      502,
      {
        code: "EGP_INVITATION_CATEGORY_CONFLICT",
        kind: ERROR_KIND.INVALID_RESPONSE,
      }
    );
  }

  // The public D0 flow invokes infoProcureDocAnnounZip. buildName2 is a
  // template reference for the separate announcement PDF and must never be
  // used as this ZIP's file ID. A shared Draft Temp locator is accepted only
  // because D0 independently confirms that an Invitation category exists.
  return createDocumentMetadata({
    projectId,
    category: DOCUMENT_CATEGORY.INVITATION,
    fileId: validateFileId(data.zipId),
    fileName: validateZipFileName(data.buildName1),
    lookupMethod: LOOKUP_METHOD.INVITATION_APPROVAL_FINAL,
    additionalFields: {
      announcementTemplateId: data.buildName2
        ? validateFileId(data.buildName2)
        : null,
    },
  });
}

function normalizeLocatorField(value) {
  return value === null || value === undefined ? null : String(value).trim();
}

function sameLocator(left, right) {
  if (!left || !right) return false;
  return ["zipId", "buildName1", "buildName2"].every(
    (field) =>
      normalizeLocatorField(left[field]) === normalizeLocatorField(right[field])
  );
}

module.exports = {
  getInvitationBiddingDocumentMetadata,
};

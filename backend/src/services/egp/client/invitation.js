const {
  EGP_BASE_URL,
  APPROVAL_COMMON_PATH,
  DOCUMENT_CATEGORY,
  LOOKUP_METHOD,
} = require("./constants");
const { validateFileId, validateZipFileName } = require("./validation");
const { request, readMetadataJson } = require("./transport");
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
  if (
    payload?.response?.responseCode !== "0" ||
    !data?.zipId ||
    !data?.buildName1
  ) {
    return createNotFoundMetadata(
      projectId,
      DOCUMENT_CATEGORY.INVITATION,
      LOOKUP_METHOD.INVITATION_APPROVAL_FINAL
    );
  }

  // The public website maps the UI label "เอกสารประกวดราคา" to zipId and
  // buildName1. buildName2 is a template reference for the separate
  // "ประกาศเชิญชวน" PDF and must never be used as this ZIP's file ID.
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

module.exports = {
  getInvitationBiddingDocumentMetadata,
};

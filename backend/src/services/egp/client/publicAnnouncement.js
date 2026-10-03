const crypto = require("crypto");
const { ANNOUNCEMENT_PATH, EGP_BASE_URL } = require("./constants");
const { ERROR_KIND, EgpServiceError } = require("./errors");
const { request, readMetadataJson } = require("./transport");

function encryptAnnouncementData(value) {
  const salt = crypto.randomBytes(8);
  const password = Buffer.from("RDCrypto", "utf8");
  let derived = Buffer.alloc(0);
  let previous = Buffer.alloc(0);

  // Match the public e-GP CryptoJS/OpenSSL passphrase format.
  while (derived.length < 48) {
    previous = crypto
      .createHash("md5")
      .update(Buffer.concat([previous, password, salt]))
      .digest();
    derived = Buffer.concat([derived, previous]);
  }

  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    derived.subarray(0, 32),
    derived.subarray(32, 48)
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return encodeURIComponent(
    Buffer.concat([Buffer.from("Salted__"), salt, encrypted]).toString("base64")
  );
}

function categoryVerificationError(message) {
  return new EgpServiceError(message, 502, {
    code: "EGP_INVITATION_CATEGORY_UNVERIFIED",
    kind: ERROR_KIND.RECOVERABLE,
  });
}

function tokenHeaders(token, options) {
  return {
    ...options.headers,
    "X-Announcement-Token": token,
    noToken: "noToken",
    noDataProfile: "noDataProfile",
  };
}

async function getPublicAnnouncementDocumentList(projectId, options = {}) {
  const tokenUrl = new URL(`${ANNOUNCEMENT_PATH}/generateToken`, EGP_BASE_URL);
  const firstKey = encryptAnnouncementData({ projectId });
  const key = encryptAnnouncementData(firstKey);
  const tokenResponse = await request(tokenUrl, {
    ...options,
    method: "POST",
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      noToken: "noToken",
      noDataProfile: "noDataProfile",
    },
    body: JSON.stringify({ key }),
  });
  const tokenPayload = await readMetadataJson(
    tokenResponse,
    "Invitation category token"
  );
  const token = String(tokenPayload?.data || "").trim();
  if (!token) {
    throw categoryVerificationError(
      "e-GP returned an incomplete Invitation category token"
    );
  }

  const detailUrl = new URL(`${ANNOUNCEMENT_PATH}/getProjectDetail`, EGP_BASE_URL);
  detailUrl.searchParams.set("projectId", projectId);
  const detailResponse = await request(detailUrl, {
    ...options,
    headers: tokenHeaders(token, options),
  });
  const detailPayload = await readMetadataJson(
    detailResponse,
    "Invitation category project"
  );
  if (String(detailPayload?.validateAnnouncementToken ?? "") === "0") {
    throw categoryVerificationError(
      "e-GP rejected the Invitation category token"
    );
  }
  const detail = detailPayload?.data;
  if (!detail || typeof detail !== "object" || !detail.methodId) {
    throw categoryVerificationError(
      "e-GP returned incomplete Invitation category project metadata"
    );
  }

  const greenBookUrl = new URL(`${ANNOUNCEMENT_PATH}/greenBook`, EGP_BASE_URL);
  greenBookUrl.searchParams.set(
    "mode",
    detail.isSect7 ? "LINK_SECTION" : "LINK"
  );
  greenBookUrl.searchParams.set("methodId", String(detail.methodId));
  greenBookUrl.searchParams.set("tempProjectId", projectId);
  if (detail.announceType) {
    greenBookUrl.searchParams.set("pageAnnounceType", detail.announceType);
  }

  const greenBookResponse = await request(greenBookUrl, {
    ...options,
    headers: tokenHeaders(token, options),
  });
  const greenBookPayload = await readMetadataJson(
    greenBookResponse,
    "Invitation category document list"
  );
  if (String(greenBookPayload?.validateAnnouncementToken ?? "") === "0") {
    throw categoryVerificationError(
      "e-GP rejected the Invitation category document-list token"
    );
  }
  if (String(greenBookPayload?.response?.responseCode ?? "") !== "0") {
    throw categoryVerificationError(
      "e-GP did not confirm a complete Invitation category document list"
    );
  }
  const records = greenBookPayload?.data?.greenBookAnnouncementTypeLinkDto;
  if (!Array.isArray(records)) {
    throw categoryVerificationError(
      "e-GP returned an incomplete Invitation category document list"
    );
  }

  return records;
}

module.exports = {
  encryptAnnouncementData,
  getPublicAnnouncementDocumentList,
};

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  discoverProjectDocuments,
  extractPdfTextFromZip,
  getDraftEbiddingArchive,
  getDraftEbiddingMetadata,
  getInvitationArchive,
  getInvitationMetadata,
  getPriceEstimateArchive,
  getPriceEstimateDocument,
  isSafeArchivePath,
} = require("../src/services/egp/egpDocumentService");

const ZIP_WITH_ONE_PDF = Buffer.from(
  "UEsDBBQAAAAIAPm8LF34yZN/DwAAAA0AAAAHAAAAdG9yLnBkZlMNcHHTNdQzUUhLzE4FAFBLAQIUABQAAAAIAPm8LF34yZN/DwAAAA0AAAAHAAAAAAAAAAAAAAAAAAAAAAB0b3IucGRmUEsFBgAAAAABAAEANQAAADQAAAAAAA==",
  "base64"
);
const ZIP_WITH_FAKE_PDF = Buffer.from(
  "UEsDBBQAAAAIADxvLV0kLzrCEgAAABAAAAAIAAAAZmFrZS5wZGbLyy9RKEpNzMmpVEhUKEhJAwBQSwECFAAUAAAACAA8by1dJC86whIAAAAQAAAACAAAAAAAAAAAAAAAAAAAAAAAZmFrZS5wZGZQSwUGAAAAAAEAAQA2AAAAOAAAAAAA",
  "base64"
);

test("archive paths reject traversal", () => {
  assert.equal(isSafeArchivePath("documents/tor.pdf"), true);
  assert.equal(isSafeArchivePath("../tor.pdf"), false);
  assert.equal(isSafeArchivePath("documents\\..\\tor.pdf"), false);
});

test("extractPdfTextFromZip returns PDF names and normalized text", async () => {
  const parsePdf = async () => ({
    text: "This is enough extracted TOR text to continue to structured extraction.",
  });
  const result = await extractPdfTextFromZip(ZIP_WITH_ONE_PDF, { parsePdf });

  assert.deepEqual(result.pdfFileNames, ["tor.pdf"]);
  assert.match(result.extractedText, /extracted TOR text/);
  assert.equal(result.textLength, result.extractedText.length);
});

test("extractPdfTextFromZip rejects a fake PDF extension", async () => {
  await assert.rejects(
    () => extractPdfTextFromZip(ZIP_WITH_FAKE_PDF),
    /valid PDF signature/
  );
});

test("getPriceEstimateDocument preserves metadata when a PDF needs OCR", async () => {
  let requestCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            zipFileId: "source-file-id",
            zipFileName: "price-estimate.zip",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(ZIP_WITH_ONE_PDF, {
      status: 200,
      headers: { "content-type": "application/zip" },
    });
  };

  await assert.rejects(
    () =>
      getPriceEstimateDocument("67039549408", {
        fetchImpl,
        parsePdf: async () => ({ text: "" }),
      }),
    (error) => {
      assert.match(error.message, /OCR is not implemented/);
      assert.equal(error.documentMetadata.sourceFileId, "source-file-id");
      assert.equal(
        error.documentMetadata.sourceDocument,
        "price-estimate.zip"
      );
      assert.deepEqual(error.documentMetadata.pdfFileNames, ["tor.pdf"]);
      assert.match(error.documentMetadata.sourceSha256, /^[a-f0-9]{64}$/);
      return true;
    }
  );
});

test("getPriceEstimateArchive downloads with stored MongoDB metadata", async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(url);
    return new Response(ZIP_WITH_ONE_PDF, {
      status: 200,
      headers: { "content-type": "application/zip" },
    });
  };

  const result = await getPriceEstimateArchive(
    "67079622362",
    {
      fileId: "stored-file-id",
      fileName: "pricebuild_67079622362.zip",
    },
    { fetchImpl }
  );

  assert.equal(requestedUrls.length, 1);
  assert.equal(
    requestedUrls[0].pathname,
    "/egp-upload-service/v1/downloadFileTest"
  );
  assert.equal(requestedUrls[0].searchParams.get("fileId"), "stored-file-id");
  assert.equal(result.fileName, "pricebuild_67079622362.zip");
  assert.deepEqual(result.zipBuffer, ZIP_WITH_ONE_PDF);
});

test("getPriceEstimateArchive looks up metadata when MongoDB has none", async () => {
  let requestCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            zipFileId: "looked-up-file-id",
            zipFileName: "looked-up.zip",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(ZIP_WITH_ONE_PDF, {
      status: 200,
      headers: { "content-type": "application/zip" },
    });
  };

  const result = await getPriceEstimateArchive(
    "67079622362",
    {},
    { fetchImpl }
  );

  assert.equal(requestCount, 2);
  assert.equal(result.fileId, "looked-up-file-id");
  assert.equal(result.fileName, "looked-up.zip");
});

test("document service delegates discovery and download to the e-GP adapter", async () => {
  const calls = [];
  const egpAdapter = {
    async discoverPriceEstimate(projectId) {
      calls.push(["discover", projectId]);
      return {
        projectId,
        category: "price_estimate",
        source: "national_egp",
        lookupMethod: "price_primary",
        downloadMethod: "file_id",
        fileId: "adapter-file-id",
        fileName: "adapter-price.zip",
      };
    },
    async downloadDocument(metadata) {
      calls.push(["download", metadata.fileId]);
      return ZIP_WITH_ONE_PDF;
    },
  };

  const result = await getPriceEstimateArchive(
    "67079622362",
    {},
    { egpAdapter }
  );

  assert.deepEqual(calls, [
    ["discover", "67079622362"],
    ["download", "adapter-file-id"],
  ]);
  assert.equal(result.fileName, "adapter-price.zip");
  assert.deepEqual(result.zipBuffer, ZIP_WITH_ONE_PDF);
});

test("stored file ID failure rediscoveries metadata and retries once", async () => {
  const calls = [];
  const staleError = Object.assign(new Error("stale file ID"), {
    code: "EGP_HTTP_ERROR",
    upstreamStatus: 404,
  });
  const egpAdapter = {
    shouldRediscoverAfterDownloadError(error) {
      return error.upstreamStatus === 404;
    },
    async discoverPriceEstimate(projectId) {
      calls.push(["discover", projectId]);
      return {
        projectId,
        fileId: "fresh-file-id",
        fileName: "fresh-price.zip",
        downloadMethod: "file_id",
      };
    },
    async downloadDocument(metadata) {
      calls.push(["download", metadata.fileId]);
      if (metadata.fileId === "stale-file-id") throw staleError;
      return ZIP_WITH_ONE_PDF;
    },
  };

  const result = await getPriceEstimateArchive(
    "67079622362",
    { fileId: "stale-file-id", fileName: "stale-price.zip" },
    { egpAdapter }
  );

  assert.deepEqual(calls, [
    ["download", "stale-file-id"],
    ["discover", "67079622362"],
    ["download", "fresh-file-id"],
  ]);
  assert.equal(result.fileId, "fresh-file-id");
  assert.equal(result.fileName, "fresh-price.zip");
});

test("stored file ID access denial does not attempt rediscovery", async () => {
  let discoveryCount = 0;
  const deniedError = Object.assign(new Error("access denied"), {
    code: "EGP_ACCESS_DENIED",
    upstreamStatus: 403,
  });
  const egpAdapter = {
    shouldRediscoverAfterDownloadError() {
      return false;
    },
    async discoverPriceEstimate() {
      discoveryCount += 1;
      throw new Error("should not run");
    },
    async downloadDocument() {
      throw deniedError;
    },
  };

  await assert.rejects(
    () =>
      getPriceEstimateArchive(
        "67079622362",
        { fileId: "stored-file-id", fileName: "stored.zip" },
        { egpAdapter }
      ),
    /access denied/
  );
  assert.equal(discoveryCount, 0);
});

test("stored legacy Price Estimate filename is reused without discovery", async () => {
  const calls = [];
  const egpAdapter = {
    async discoverPriceEstimate() {
      throw new Error("discovery should not run");
    },
    async downloadDocument(metadata) {
      calls.push(metadata);
      return ZIP_WITH_ONE_PDF;
    },
  };

  await getPriceEstimateArchive(
    "65117172803",
    {
      fileId: null,
      fileName: "pricebuild_310000110000034_65117172803.zip",
      downloadMethod: "legacy_filename",
    },
    { egpAdapter }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].downloadMethod, "legacy_filename");
  assert.equal(calls[0].fileId, null);
});

test("invitation metadata discovery is delegated to the e-GP adapter", async () => {
  const egpAdapter = {
    async discoverInvitation(projectId) {
      return {
        projectId,
        category: "invitation",
        status: "available",
        source: "national_egp",
        lookupMethod: "invitation_approval_final",
        downloadMethod: "file_id",
        fileId: "invitation-file-id",
        fileName: "bidding-documents.zip",
        announcementTemplateId: "announcement-template-id",
      };
    },
  };

  const result = await getInvitationMetadata("68059426756", { egpAdapter });

  assert.equal(result.fileId, "invitation-file-id");
  assert.equal(result.fileName, "bidding-documents.zip");
  assert.equal(result.announcementTemplateId, "announcement-template-id");
});

test("invitation archive downloads zipId and never the announcement template", async () => {
  const calls = [];
  const egpAdapter = {
    async discoverInvitation(projectId) {
      calls.push(["discover", projectId]);
      return {
        projectId,
        category: "invitation",
        status: "available",
        fileId: "invitation-file-id",
        fileName: "bidding-documents.zip",
        announcementTemplateId: "announcement-template-id",
        downloadMethod: "file_id",
      };
    },
    async downloadDocument(metadata) {
      calls.push(["download", metadata.fileId]);
      assert.notEqual(metadata.fileId, metadata.announcementTemplateId);
      return ZIP_WITH_ONE_PDF;
    },
  };

  const result = await getInvitationArchive(
    "68059426756",
    {},
    { egpAdapter }
  );

  assert.deepEqual(calls, [
    ["discover", "68059426756"],
    ["download", "invitation-file-id"],
  ]);
  assert.equal(result.fileName, "bidding-documents.zip");
  assert.deepEqual(result.zipBuffer, ZIP_WITH_ONE_PDF);
});

test("invitation archive reports not found when only announcement PDF exists", async () => {
  const egpAdapter = {
    async discoverInvitation(projectId) {
      return {
        projectId,
        category: "invitation",
        status: "not_found",
        fileId: null,
        fileName: null,
        downloadUrl: null,
      };
    },
  };

  await assert.rejects(
    () => getInvitationArchive("68059426756", {}, { egpAdapter }),
    (error) => {
      assert.equal(error.code, "EGP_INVITATION_NOT_FOUND");
      assert.equal(error.statusCode, 422);
      return true;
    }
  );
});

test("stored Invitation file ID is rediscovered once when stale", async () => {
  const calls = [];
  const staleError = Object.assign(new Error("stale Invitation ID"), {
    upstreamStatus: 404,
  });
  const egpAdapter = {
    shouldRediscoverAfterDownloadError(error) {
      return error.upstreamStatus === 404;
    },
    async discoverInvitation(projectId) {
      calls.push(["discover", projectId]);
      return {
        projectId,
        status: "available",
        fileId: "fresh-invitation-id",
        fileName: "fresh-invitation.zip",
      };
    },
    async downloadDocument(metadata) {
      calls.push(["download", metadata.fileId]);
      if (metadata.fileId === "stale-invitation-id") throw staleError;
      return ZIP_WITH_ONE_PDF;
    },
  };

  const result = await getInvitationArchive(
    "68059426756",
    { fileId: "stale-invitation-id", fileName: "stale.zip" },
    { egpAdapter }
  );

  assert.deepEqual(calls, [
    ["download", "stale-invitation-id"],
    ["discover", "68059426756"],
    ["download", "fresh-invitation-id"],
  ]);
  assert.equal(result.fileId, "fresh-invitation-id");
});

test("draft e-bidding metadata discovery is delegated to the e-GP adapter", async () => {
  const egpAdapter = {
    async discoverDraftEbidding(projectId) {
      return {
        projectId,
        category: "draft_ebidding",
        status: "available",
        fileId: "draft-file-id",
        fileName: "draft.zip",
        revision: 2,
        version: "revision_2",
      };
    },
  };

  const result = await getDraftEbiddingMetadata("68059426756", { egpAdapter });

  assert.equal(result.fileId, "draft-file-id");
  assert.equal(result.revision, 2);
});

test("draft e-bidding archive downloads only an unambiguous selected revision", async () => {
  const calls = [];
  const egpAdapter = {
    async discoverDraftEbidding(projectId) {
      calls.push(["discover", projectId]);
      return {
        projectId,
        category: "draft_ebidding",
        status: "available",
        fileId: "draft-revision-2",
        fileName: "draft-revision-2.zip",
        revision: 2,
        version: "revision_2",
        downloadMethod: "file_id",
      };
    },
    async downloadDocument(metadata) {
      calls.push(["download", metadata.fileId]);
      return ZIP_WITH_ONE_PDF;
    },
  };

  const result = await getDraftEbiddingArchive(
    "68059426756",
    {},
    { egpAdapter }
  );

  assert.deepEqual(calls, [
    ["discover", "68059426756"],
    ["download", "draft-revision-2"],
  ]);
  assert.equal(result.revision, 2);
  assert.equal(result.version, "revision_2");
  assert.deepEqual(result.zipBuffer, ZIP_WITH_ONE_PDF);
});

test("draft e-bidding archive reuses a stored Legacy Draft locator", async () => {
  const calls = [];
  const storedMetadata = {
    fileId: null,
    fileName: "65077164290_25650831154250_2.zip",
    downloadMethod: "legacy_draft_transfer",
    legacyItemNo: 3,
    legacyTypeId: "04",
    legacyDocType: "adj",
    legacyMethodId: "16",
    legacyStepId: "U03",
    version: "legacy_25650831154250",
  };
  const egpAdapter = {
    async discoverDraftEbidding() {
      calls.push(["discover"]);
      throw new Error("stored Legacy Draft should not be rediscovered");
    },
    async downloadDocument(metadata) {
      calls.push(["download", metadata]);
      return ZIP_WITH_ONE_PDF;
    },
  };

  const result = await getDraftEbiddingArchive(
    "65077164290",
    storedMetadata,
    { egpAdapter }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "download");
  assert.equal(calls[0][1].fileId, null);
  assert.equal(calls[0][1].downloadMethod, "legacy_draft_transfer");
  assert.equal(calls[0][1].legacyItemNo, 3);
  assert.equal(calls[0][1].legacyTypeId, "04");
  assert.equal(calls[0][1].legacyDocType, "adj");
  assert.equal(result.fileName, storedMetadata.fileName);
  assert.equal(result.legacyItemNo, 3);
  assert.equal(result.version, "legacy_25650831154250");
  assert.deepEqual(result.zipBuffer, ZIP_WITH_ONE_PDF);
});

test("incomplete stored Legacy Draft metadata is rediscovered", async () => {
  const calls = [];
  const egpAdapter = {
    async discoverDraftEbidding(projectId) {
      calls.push(["discover", projectId]);
      return {
        projectId,
        category: "draft_ebidding",
        status: "available",
        fileId: "modern-draft-id",
        fileName: "modern-draft.zip",
        downloadMethod: "file_id",
      };
    },
    async downloadDocument(metadata) {
      calls.push(["download", metadata.fileId]);
      return ZIP_WITH_ONE_PDF;
    },
  };

  await getDraftEbiddingArchive(
    "65077164290",
    {
      fileName: "65077164290_25650831154250_2.zip",
      downloadMethod: "legacy_draft_transfer",
      legacyItemNo: null,
      legacyTypeId: "04",
      legacyDocType: "adj",
      legacyMethodId: "16",
    },
    { egpAdapter }
  );

  assert.deepEqual(calls, [
    ["discover", "65077164290"],
    ["download", "modern-draft-id"],
  ]);
});

test("draft e-bidding archive refuses an ambiguous selection", async () => {
  let downloadCalled = false;
  const egpAdapter = {
    async discoverDraftEbidding(projectId) {
      return {
        projectId,
        category: "draft_ebidding",
        status: "ambiguous",
        fileId: null,
        candidateCount: 2,
        ambiguityReason: "conflicting_latest_revision",
      };
    },
    async downloadDocument() {
      downloadCalled = true;
    },
  };

  await assert.rejects(
    () => getDraftEbiddingArchive("68059426756", {}, { egpAdapter }),
    (error) => {
      assert.equal(error.code, "EGP_DRAFT_EBIDDING_AMBIGUOUS");
      assert.equal(error.details.candidateCount, 2);
      return true;
    }
  );
  assert.equal(downloadCalled, false);
});

test("stale Draft file ID rediscovery still refuses an ambiguous result", async () => {
  let downloadCount = 0;
  const staleError = Object.assign(new Error("stale Draft ID"), {
    upstreamStatus: 404,
  });
  const egpAdapter = {
    shouldRediscoverAfterDownloadError() {
      return true;
    },
    async discoverDraftEbidding(projectId) {
      return {
        projectId,
        status: "ambiguous",
        candidateCount: 2,
        ambiguityReason: "conflicting_latest_revision",
      };
    },
    async downloadDocument() {
      downloadCount += 1;
      throw staleError;
    },
  };

  await assert.rejects(
    () =>
      getDraftEbiddingArchive(
        "68059426756",
        { fileId: "stale-draft-id", fileName: "stale-draft.zip" },
        { egpAdapter }
      ),
    (error) => {
      assert.equal(error.code, "EGP_DRAFT_EBIDDING_AMBIGUOUS");
      return true;
    }
  );
  assert.equal(downloadCount, 1);
});

test("project document discovery checks every category after an earlier failure", async () => {
  const calls = [];
  const checkedAt = new Date("2026-10-02T10:00:00.000Z");
  const priceError = Object.assign(new Error("price endpoint unavailable"), {
    code: "EGP_TIMEOUT",
    kind: "recoverable",
    details: {
      lookupAttempts: [{ lookupMethod: "price_primary", outcome: "error" }],
    },
  });
  const egpAdapter = {
    async discoverPriceEstimate() {
      calls.push("priceEstimate");
      throw priceError;
    },
    async discoverInvitation(projectId) {
      calls.push("invitation");
      return {
        projectId,
        category: "invitation",
        status: "not_found",
        source: "national_egp",
        fileId: null,
        fileName: null,
        downloadUrl: null,
      };
    },
    async discoverDraftEbidding(projectId) {
      calls.push("draftEbidding");
      return {
        projectId,
        category: "draft_ebidding",
        status: "available",
        source: "national_egp",
        fileId: "draft-id",
        fileName: "draft.zip",
        downloadUrl: "https://example.test/draft-id",
      };
    },
  };

  const result = await discoverProjectDocuments("68059426756", {
    egpAdapter,
    now: () => checkedAt,
  });

  assert.deepEqual(calls, ["priceEstimate", "invitation", "draftEbidding"]);
  assert.equal(result.documents.priceEstimate.status, "error");
  assert.equal(result.documents.priceEstimate.error.code, "EGP_TIMEOUT");
  assert.deepEqual(result.documents.priceEstimate.lookupAttempts, [
    { lookupMethod: "price_primary", outcome: "error" },
  ]);
  assert.equal(result.documents.invitation.status, "not_found");
  assert.equal(result.documents.draftEbidding.status, "available");
  assert.equal(result.documents.selectedProcurementDocument, "draftEbidding");
  assert.equal(result.documents.priceEstimate.lastCheckedAt, checkedAt);
  assert.equal(result.documents.invitation.lastCheckedAt, checkedAt);
  assert.equal(result.documents.draftEbidding.lastCheckedAt, checkedAt);
});

test("project document discovery prefers Invitation while retaining Draft", async () => {
  const available = (projectId, category, fileId) => ({
    projectId,
    category,
    status: "available",
    source: "national_egp",
    fileId,
    fileName: `${fileId}.zip`,
    downloadUrl: `https://example.test/${fileId}`,
  });
  const egpAdapter = {
    discoverPriceEstimate: async (projectId) =>
      available(projectId, "price_estimate", "price-id"),
    discoverInvitation: async (projectId) =>
      available(projectId, "invitation", "invitation-id"),
    discoverDraftEbidding: async (projectId) =>
      available(projectId, "draft_ebidding", "draft-id"),
  };

  const result = await discoverProjectDocuments("68059426756", { egpAdapter });

  assert.equal(result.documents.selectedProcurementDocument, "invitation");
  assert.equal(result.documents.invitation.fileId, "invitation-id");
  assert.equal(result.documents.draftEbidding.fileId, "draft-id");
  assert.equal(result.documents.priceEstimate.fileId, "price-id");
});

test("project document discovery does not treat an Invitation error as absence", async () => {
  const egpAdapter = {
    async discoverPriceEstimate(projectId) {
      return { projectId, status: "not_found" };
    },
    async discoverInvitation() {
      throw Object.assign(new Error("Invitation lookup failed"), {
        code: "EGP_NETWORK_ERROR",
        kind: "recoverable",
      });
    },
    async discoverDraftEbidding(projectId) {
      return {
        projectId,
        status: "available",
        fileId: "draft-id",
        fileName: "draft.zip",
      };
    },
  };

  const result = await discoverProjectDocuments("68059426756", { egpAdapter });

  assert.equal(result.documents.invitation.status, "error");
  assert.equal(result.documents.draftEbidding.status, "available");
  assert.equal(result.documents.selectedProcurementDocument, null);
});

test("project document discovery normalizes a Price not-found exception", async () => {
  const egpAdapter = {
    async discoverPriceEstimate() {
      throw Object.assign(new Error("No price estimate document found"), {
        code: "EGP_DOCUMENT_NOT_FOUND",
        kind: "not_found",
        details: {
          lookupAttempts: [
            { lookupMethod: "price_primary", outcome: "not_found" },
          ],
        },
      });
    },
    async discoverInvitation(projectId) {
      return { projectId, status: "not_found" };
    },
    async discoverDraftEbidding(projectId) {
      return { projectId, status: "not_found" };
    },
  };

  const result = await discoverProjectDocuments("68059426756", { egpAdapter });

  assert.equal(result.documents.priceEstimate.status, "not_found");
  assert.equal("error" in result.documents.priceEstimate, false);
  assert.deepEqual(result.documents.priceEstimate.lookupAttempts, [
    { lookupMethod: "price_primary", outcome: "not_found" },
  ]);
});

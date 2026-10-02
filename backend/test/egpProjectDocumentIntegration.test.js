const test = require("node:test");
const assert = require("node:assert/strict");
const GovProject = require("../src/models/GovProject");
const {
  createNationalEgpAdapter,
} = require("../src/services/egp/egpClient");
const {
  discoverProjectDocuments,
} = require("../src/services/egp/egpDocumentService");
const {
  getLocalFilteredProjects,
} = require("../src/services/localProjectProvider");

test("real adapter contract produces all normalized project document categories", async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(`${url.pathname}${url.search}`);

    if (url.pathname.endsWith("infoDocPriceestZipHis")) {
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            zipFileId: "price-file-id",
            zipFileName: "price.zip",
          },
        })
      );
    }
    if (url.pathname.endsWith("infoProcureDocAnnounZip")) {
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            zipId: "invitation-file-id",
            buildName1: "invitation.zip",
            buildName2: "announcement-template-id",
          },
        })
      );
    }
    if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) {
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            zipId: "draft-file-id",
            buildName1: "draft.zip",
          },
        })
      );
    }
    if (url.pathname.endsWith("infoProcureDocAnnounZipAdj")) {
      assert.equal(url.searchParams.get("itemNo"), "1");
      return new Response(
        JSON.stringify({ response: { responseCode: "1" }, data: null })
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const adapter = createNationalEgpAdapter({ fetchImpl, maxRetries: 0 });
  const checkedAt = new Date("2026-10-03T00:00:00.000Z");

  const result = await discoverProjectDocuments("68059426756", {
    egpAdapter: adapter,
    now: () => checkedAt,
  });

  // This order also proves discovery is metadata-only and sequential: no
  // downloadFileTest request should appear while enriching document references.
  assert.deepEqual(requests, [
    "/egp-doc-price-estimate-service/dpe-common/infoDocPriceestZipHis?projectId=68059426756",
    "/egp-approval-service/apv-common/infoProcureDocAnnounZip?projectId=68059426756",
    "/egp-approval-service/apv-common/infoProcureDocAnnounZipTemp?projectId=68059426756",
    "/egp-approval-service/apv-common/infoProcureDocAnnounZipAdj?projectId=68059426756&itemNo=1",
  ]);
  assert.equal(result.documents.priceEstimate.fileId, "price-file-id");
  assert.equal(result.documents.invitation.fileId, "invitation-file-id");
  assert.equal(result.documents.draftEbidding.fileId, "draft-file-id");
  assert.equal(result.documents.selectedProcurementDocument, "invitation");
  assert.equal(result.documents.invitation.lastCheckedAt, checkedAt);
});

test("local JSON projects can use the shared discovery result in the Mongo schema", async () => {
  const [localProject] = await getLocalFilteredProjects({ limit: 1 });
  assert.equal(localProject.project_id, "68059426756");

  const available = (projectId, category) => ({
    projectId,
    category,
    status: "available",
    source: "national_egp",
    lookupMethod: `${category}_test_lookup`,
    downloadMethod: "file_id",
    fileId: `${category}-id`,
    fileName: `${category}.zip`,
    downloadUrl: `https://example.test/${category}-id`,
  });
  const egpAdapter = {
    discoverPriceEstimate: async (projectId) =>
      available(projectId, "price_estimate"),
    discoverInvitation: async (projectId) =>
      available(projectId, "invitation"),
    discoverDraftEbidding: async (projectId) =>
      available(projectId, "draft_ebidding"),
  };
  const discovery = await discoverProjectDocuments(localProject.project_id, {
    egpAdapter,
  });
  const model = new GovProject({
    project_id: localProject.project_id,
    project_name: localProject.project_name,
    raw_data: localProject,
    documents: discovery.documents,
  });

  await model.validate();
  assert.equal(model.documents.priceEstimate.fileId, "price_estimate-id");
  assert.equal(model.documents.invitation.fileId, "invitation-id");
  assert.equal(model.documents.draftEbidding.fileId, "draft_ebidding-id");
  assert.equal(model.documents.selectedProcurementDocument, "invitation");
  assert.equal(model.raw_data.project_id, localProject.project_id);
});

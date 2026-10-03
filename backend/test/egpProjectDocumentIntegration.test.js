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

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function confirmedMissingResponse() {
  return jsonResponse({
    response: {
      responseCode: "1",
      messageCode: "E0001",
      description: "not found",
    },
    data: null,
  });
}

function legacyListResponse(data) {
  return jsonResponse({
    response: { responseCode: 0, responseDesc: "" },
    data,
  });
}

function priceResponse(projectId) {
  return jsonResponse({
    response: { responseCode: "0" },
    data: {
      zipFileId: `price-${projectId}`,
      zipFileName: `price-${projectId}.zip`,
    },
  });
}

test("65077164290 selects and downloads the newest of four Legacy Drafts", async () => {
  const projectId = "65077164290";
  const requests = [];
  const legacyCandidates = [
    {
      projectId,
      buildName: "65077164290_25650805170219_2.zip",
      webDate: "2022-08-04T17:00:00.000Z",
      commentFDate: "2022-08-10T17:00:00.000Z",
      stepId: "D03",
    },
    {
      projectId,
      buildName: "65077164290_25650816165634_2.zip",
      webDate: "2022-08-15T17:00:00.000Z",
      commentFDate: "2022-08-18T17:00:00.000Z",
      stepId: "U03",
    },
    {
      projectId,
      buildName: "65077164290_25650830164828_2.zip",
      webDate: "2022-08-29T17:00:00.000Z",
      commentFDate: "2022-09-01T17:00:00.000Z",
      stepId: "U03",
    },
    {
      projectId,
      buildName: "65077164290_25650831154250_2.zip",
      webDate: "2022-08-30T17:00:00.000Z",
      commentFDate: "2022-09-04T17:00:00.000Z",
      stepId: "U03",
    },
  ];
  const zip = Buffer.from("PK\u0003\u0004verified-65077164290");
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.pathname.endsWith("infoDocPriceestZipHis")) {
      return priceResponse(projectId);
    }
    if (url.pathname.endsWith("infoProcureDocAnnounZip")) {
      return confirmedMissingResponse();
    }
    if (
      url.pathname.endsWith("infoProcureDocAnnounZipTemp") ||
      url.pathname.endsWith("infoProcureDocAnnounZipAdj")
    ) {
      return confirmedMissingResponse();
    }
    if (url.pathname.endsWith("getTorZipList")) {
      return legacyListResponse(legacyCandidates);
    }
    if (url.pathname.endsWith("/EGPTransService/control.download")) {
      return new Response(zip, {
        status: 200,
        headers: { "content-type": "application/zip" },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const adapter = createNationalEgpAdapter({ fetchImpl, maxRetries: 0 });

  const discovery = await discoverProjectDocuments(projectId, {
    egpAdapter: adapter,
  });
  const draft = discovery.documents.draftEbidding;

  assert.equal(discovery.documents.invitation.status, "not_found");
  assert.equal(draft.status, "available");
  assert.equal(draft.fileName, "65077164290_25650831154250_2.zip");
  assert.equal(draft.candidateCount, 4);
  assert.equal(draft.legacyItemNo, 3);
  assert.equal(draft.legacyTypeId, "04");
  assert.equal(draft.legacyDocType, "adj");
  assert.equal(
    discovery.documents.selectedProcurementDocument,
    "draftEbidding"
  );

  const downloaded = await adapter.downloadDocument(draft);
  assert.deepEqual(downloaded, zip);
  const transfer = requests.at(-1);
  assert.equal(transfer.options.method, "POST");
  assert.equal(transfer.options.body.get("itemNo"), "3");
  assert.equal(transfer.options.body.get("typeId"), "04");
  assert.equal(transfer.options.body.get("docType"), "adj");
  assert.equal(
    transfer.options.body.get("fileName"),
    "65077164290_25650831154250_2.zip"
  );
});

test("64117010720 persists one selected Legacy Draft when Invitation is absent", async () => {
  const projectId = "64117010720";
  const fetchImpl = async (url) => {
    if (url.pathname.endsWith("infoDocPriceestZipHis")) {
      return priceResponse(projectId);
    }
    if (url.pathname.endsWith("infoProcureDocAnnounZip")) {
      return confirmedMissingResponse();
    }
    if (
      url.pathname.endsWith("infoProcureDocAnnounZipTemp") ||
      url.pathname.endsWith("infoProcureDocAnnounZipAdj")
    ) {
      return confirmedMissingResponse();
    }
    if (url.pathname.endsWith("getTorZipList")) {
      return legacyListResponse(
        url.searchParams.get("typeId") === "03"
          ? [
              {
                projectId,
                buildName: "64117010720_25641104130520_2.zip",
                webDate: "2021-11-03T17:00:00.000Z",
                commentFDate: "2021-11-08T17:00:00.000Z",
                stepId: "D03",
              },
            ]
          : []
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const adapter = createNationalEgpAdapter({ fetchImpl, maxRetries: 0 });
  const discovery = await discoverProjectDocuments(projectId, {
    egpAdapter: adapter,
  });
  const model = new GovProject({
    project_id: projectId,
    project_name: "Legacy Draft integration fixture",
    documents: discovery.documents,
  });

  await model.validate();
  assert.equal(model.documents.invitation.status, "not_found");
  assert.equal(model.documents.draftEbidding.status, "available");
  assert.equal(model.documents.draftEbidding.legacyItemNo, 0);
  assert.equal(model.documents.draftEbidding.legacyTypeId, "03");
  assert.equal(
    model.documents.draftEbidding.fileName,
    "64117010720_25641104130520_2.zip"
  );
  assert.equal(
    model.documents.selectedProcurementDocument,
    "draftEbidding"
  );
});

test("67079622362 remains Price Estimate only with no selected procurement document", async () => {
  const projectId = "67079622362";
  const legacyTypeIds = [];
  const fetchImpl = async (url, options) => {
    if (url.pathname.endsWith("infoDocPriceestZipHis")) {
      return jsonResponse({
        response: { responseCode: "0" },
        data: null,
      });
    }
    if (url.pathname.endsWith("listProjectPriceBuildZipByProjectId")) {
      assert.equal(options.headers.apikey, "integration-project-service-key");
      return jsonResponse({
        response: { responseCode: "0" },
        data: [
          {
            zipFileId: "e73dcaf2c8d74411a33e290240ced7d1",
            priceBuildName: "pricebuild_310000110000034_67079622362.zip",
          },
        ],
      });
    }
    if (url.pathname.endsWith("infoProcureDocAnnounZip")) {
      return confirmedMissingResponse();
    }
    if (
      url.pathname.endsWith("infoProcureDocAnnounZipTemp") ||
      url.pathname.endsWith("infoProcureDocAnnounZipAdj")
    ) {
      return confirmedMissingResponse();
    }
    if (url.pathname.endsWith("getTorZipList")) {
      legacyTypeIds.push(url.searchParams.get("typeId"));
      return legacyListResponse([]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const adapter = createNationalEgpAdapter({
    fetchImpl,
    maxRetries: 0,
    projectServiceApiKey: "integration-project-service-key",
  });

  const discovery = await discoverProjectDocuments(projectId, {
    egpAdapter: adapter,
  });

  assert.equal(discovery.documents.priceEstimate.status, "available");
  assert.equal(
    discovery.documents.priceEstimate.fileName,
    "pricebuild_310000110000034_67079622362.zip"
  );
  assert.equal(discovery.documents.invitation.status, "not_found");
  assert.equal(discovery.documents.draftEbidding.status, "not_found");
  assert.equal(discovery.documents.selectedProcurementDocument, null);
  assert.deepEqual(legacyTypeIds, ["03", "04"]);
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

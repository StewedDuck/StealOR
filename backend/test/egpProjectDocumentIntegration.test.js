const test = require("node:test");
const assert = require("node:assert/strict");
const GovProject = require("../src/models/GovProject");
const {
  LOOKUP_METHOD,
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
            projectId: "68059426756",
            zipId: "invitation-file-id",
            buildName1: "68059426756_02012568_1.zip",
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
            projectId: "68059426756",
            zipId: "draft-file-id",
            buildName1: "68059426756_01012568.zip",
            buildName2: "draft-template-id",
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
    const evidence = publicInvitationEvidenceResponse(url, true);
    if (evidence) return evidence;
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
    "/egp-oann10-service/pb/a-egp-allt-project/announcement/generateToken",
    "/egp-oann10-service/pb/a-egp-allt-project/announcement/getProjectDetail?projectId=68059426756",
    "/egp-oann10-service/pb/a-egp-allt-project/announcement/greenBook?mode=LINK&methodId=16&tempProjectId=68059426756&pageAnnounceType=B0",
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

function publicInvitationEvidenceResponse(
  url,
  hasInvitation = false,
  hasDraft = true,
  draftType = "B0",
  draftAnnounceDate = "2099-12-30T17:00:00.000Z",
  invitationAnnounceDate = "2099-12-30T17:00:00.000Z"
) {
  const projectId = url.searchParams.get("tempProjectId");
  if (url.pathname.endsWith("/generateToken")) {
    return jsonResponse({ data: "announcement-token" });
  }
  if (url.pathname.endsWith("/getProjectDetail")) {
    return jsonResponse({
      data: {
        methodId: "16",
        announceType: hasDraft ? draftType : "D0",
        isSect7: false,
      },
    });
  }
  if (url.pathname.endsWith("/greenBook")) {
    return jsonResponse({
      response: { responseCode: 0 },
      data: {
        greenBookAnnouncementTypeLinkDto: [
          ...(hasDraft
            ? [
                {
                  projectId,
                  announceType: draftType,
                  announceTypeDesc: "ร่างเอกสารประกวดราคา(e-Bidding)",
                  templateType: "D1",
                  announceFlag: "A",
                  announceDate: draftAnnounceDate,
                },
              ]
            : []),
          ...(hasInvitation
            ? [
                {
                  projectId,
                  announceType: "D0",
                  announceTypeDesc: "ประกาศเชิญชวน",
                  templateType: "D2",
                  announceFlag: "A",
                  announceDate: invitationAnnounceDate,
                },
              ]
            : []),
        ],
      },
    });
  }
  return null;
}

test("six false-positive Invitations fall back to the correct Draft", async (t) => {
  const fixtures = [
    {
      projectId: "69059292256",
      zipId: "0d8308d6782b41d488c8cb0249d2aea7",
      fileName: "69059292256_10062569.zip",
      templateId: "49a3e8de-9ca3-4ce5-9031-0ca16f28e353",
      adjusted: [
        ["e77e918cddd54c83a8d91980f8ffffb9", "69059292256_13082569_1.zip"],
        ["8d76e185e6de454bbcede4dfa39c353e", "69059292256_02102569_2.zip"],
      ],
      expectedRevision: 2,
      draftType: "B3",
    },
    {
      projectId: "69109005145",
      zipId: "b3c9f94cecad46169655a3982f5bccb4",
      fileName: "69109005145_01102569.zip",
      templateId: "10841a5c-44e0-4bb0-a4a1-9943a58b85a2",
      adjusted: [],
      expectedRevision: 0,
    },
    {
      projectId: "69099683466",
      zipId: "f1faa5e84e2f49059f048095f58e1b87",
      fileName: "69099683466_30092569.zip",
      templateId: "89180019-442b-445d-9e9e-7239d9e8862c",
      adjusted: [],
      expectedRevision: 0,
    },
    {
      projectId: "68109235287",
      zipId: "3c647d6c9b404104ac21a4e917d6262b",
      fileName: "68109235287_01092569.zip",
      templateId: "f53ae7e5-73de-4080-beb6-82a3dedd9124",
      adjusted: [
        ["bed6c75ee1654963a238ecf68ba044cc", "68109235287_23092569_1.zip"],
      ],
      expectedRevision: 1,
    },
    {
      projectId: "68049412254",
      zipId: "216ec993eccb474cb5a95c3d062ec012",
      fileName: "68049412254_30042568.zip",
      templateId: "b5372f65-b800-434a-b6ae-514928e98561",
      adjusted: [],
      expectedRevision: 0,
    },
    {
      projectId: "67119566073",
      zipId: "3b38515f2fad46dca4690d04ad7aeef4",
      fileName: "67119566073_02122567.zip",
      templateId: "2a1f4485-5a34-4031-8296-ec2ea7cbe15a",
      adjusted: [],
      expectedRevision: 0,
    },
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.projectId, async () => {
      const sharedData = {
        projectId: fixture.projectId,
        zipId: fixture.zipId,
        buildName1: fixture.fileName,
        buildName2: fixture.templateId,
      };
      const adapter = createNationalEgpAdapter({
        maxRetries: 0,
        fetchImpl: async (url) => {
          if (url.pathname.endsWith("infoDocPriceestZipHis")) {
            return priceResponse(fixture.projectId);
          }
          if (
            url.pathname.endsWith("infoProcureDocAnnounZip") ||
            url.pathname.endsWith("infoProcureDocAnnounZipTemp")
          ) {
            return jsonResponse({
              response: { responseCode: "0" },
              data: sharedData,
            });
          }
          if (url.pathname.endsWith("infoProcureDocAnnounZipAdj")) {
            const itemNo = Number(url.searchParams.get("itemNo"));
            const adjusted = fixture.adjusted[itemNo - 1];
            return adjusted
              ? jsonResponse({
                  response: { responseCode: "0" },
                  data: [{
                    projectId: fixture.projectId,
                    itemNo,
                    zipId: adjusted[0],
                    buildName1: adjusted[1],
                    buildName2: `draft-template-${itemNo}`,
                  }],
                })
              : confirmedMissingResponse();
          }
          const evidence = publicInvitationEvidenceResponse(
            url,
            false,
            true,
            fixture.draftType || "B0"
          );
          if (evidence) return evidence;
          throw new Error(`Unexpected request: ${url}`);
        },
      });

      const result = await discoverProjectDocuments(fixture.projectId, {
        egpAdapter: adapter,
      });

      assert.equal(result.documents.invitation.status, "not_found");
      assert.equal(result.documents.draftEbidding.status, "available");
      assert.equal(
        result.documents.draftEbidding.revision,
        fixture.expectedRevision
      );
      assert.equal(
        result.documents.draftEbidding.fileName,
        fixture.expectedRevision === 0
          ? fixture.fileName
          : fixture.adjusted[fixture.expectedRevision - 1][1]
      );
      assert.equal(
        result.documents.selectedProcurementDocument,
        "draftEbidding"
      );
    });
  }
});

test("D0-only projects reject a Temp locator that aliases the Invitation", async (t) => {
  const fixtures = [
    {
      projectId: "67049364890",
      fileId: "6122a17e6fc44f70925cf99c6d4dfccc",
      fileName: "67049364890_24042567.zip",
      templateId: "4ec1fe8a-d261-4157-9c05-22f0310513b9",
    },
    {
      projectId: "66119199555",
      fileId: "e960180563274470b5845e1ba6045165",
      fileName: "66119199555_16112566.zip",
      templateId: "invitation-template-66119199555",
    },
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.projectId, async () => {
      let adjustedRequests = 0;
      const sharedData = {
        projectId: fixture.projectId,
        zipId: fixture.fileId,
        buildName1: fixture.fileName,
        buildName2: fixture.templateId,
      };
      const adapter = createNationalEgpAdapter({
        maxRetries: 0,
        fetchImpl: async (url) => {
          if (url.pathname.endsWith("infoDocPriceestZipHis")) {
            return priceResponse(fixture.projectId);
          }
          if (
            url.pathname.endsWith("infoProcureDocAnnounZip") ||
            url.pathname.endsWith("infoProcureDocAnnounZipTemp")
          ) {
            return jsonResponse({
              response: { responseCode: "0" },
              data: sharedData,
            });
          }
          if (url.pathname.endsWith("infoProcureDocAnnounZipAdj")) {
            adjustedRequests += 1;
            return confirmedMissingResponse();
          }
          const evidence = publicInvitationEvidenceResponse(
            url,
            true,
            false
          );
          if (evidence) return evidence;
          throw new Error(`Unexpected request: ${url}`);
        },
      });

      const result = await discoverProjectDocuments(fixture.projectId, {
        egpAdapter: adapter,
      });

      assert.equal(result.documents.priceEstimate.status, "available");
      assert.equal(result.documents.invitation.status, "available");
      assert.equal(result.documents.invitation.fileId, fixture.fileId);
      assert.equal(result.documents.invitation.fileName, fixture.fileName);
      assert.equal(result.documents.draftEbidding.status, "not_found");
      assert.equal(
        result.documents.draftEbidding.lookupMethod,
        LOOKUP_METHOD.DRAFT_PUBLIC_CATEGORY
      );
      assert.equal(result.documents.draftEbidding.fileId, null);
      assert.equal(result.documents.draftEbidding.fileName, null);
      assert.equal(result.documents.selectedProcurementDocument, "invitation");
      assert.equal(adjustedRequests, 0);
    });
  }
});

test("authoritative B0/B3 evidence preserves legitimate Invitation and Draft cases", async (t) => {
  const fixtures = [
    {
      projectId: "69049472497",
      draftType: "B3",
      draftAnnounceDate: "2026-09-10T17:00:00.000Z",
      invitationAnnounceDate: "2026-09-28T17:00:00.000Z",
      invitation: [
        "c3918846ea6144cc9bc54af654f87186",
        "69049472497_27092569_3.zip",
        "ad0336f8-47c1-4cdb-b4c1-b2c23cb140e7",
      ],
      draft: [
        "fe5c53acd0344a02af6d79280a57b20f",
        "69049472497_01052569.zip",
        "8779aa31-7095-4669-b14e-d17f94d1b705",
      ],
      adjusted: [
        [
          "0e3118419f1f430b97fa490de326403d",
          "69049472497_10082569_1.zip",
          "3b3b36f3-dcf4-4911-9ae1-583ebede8772",
        ],
        [
          "a97880b9f3a3495c9ab5a8dd843304f9",
          "69049472497_11092569_2.zip",
          "7b4cef2c-2717-49d3-96c6-71580bc8f761",
        ],
        [
          "c3918846ea6144cc9bc54af654f87186",
          "69049472497_27092569_3.zip",
          "ad0336f8-47c1-4cdb-b4c1-b2c23cb140e7",
        ],
      ],
      expectedRevision: 2,
      expectedCandidateCount: 3,
    },
    {
      projectId: "69019529847",
      draftType: "B3",
      draftAnnounceDate: "2026-09-17T17:00:00.000Z",
      invitationAnnounceDate: "2026-09-29T17:00:00.000Z",
      invitation: [
        "bf717f519a654c1dbf0bed1c5d14354f",
        "69019529847_30092569_4.zip",
      ],
      draft: [
        "9361e9239ab74d11a32bae96453e40eb",
        "69019529847_17072569.zip",
      ],
      adjusted: [
        ["10a6af160f074d0993275c7ba5bf9792", "69019529847_17082569_1.zip"],
        ["29827a87a9064611afc082ca786877b9", "69019529847_08092569_2.zip"],
        ["b5be5a66fe434d7187a8d398bf969d51", "69019529847_18092569_3.zip"],
      ],
      expectedRevision: 3,
    },
    {
      projectId: "67049068372",
      draftType: "B0",
      invitation: [
        "d59e6c48226e4b649fba481124d40398",
        "67049068372_03052567_1.zip",
      ],
      draft: [
        "95c168cdb7784ebc81f72c946752f7db",
        "67049068372_24042567.zip",
      ],
      adjusted: [],
      expectedRevision: 0,
    },
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.projectId, async () => {
      const adapter = createNationalEgpAdapter({
        maxRetries: 0,
        fetchImpl: async (url) => {
          if (url.pathname.endsWith("infoDocPriceestZipHis")) {
            return priceResponse(fixture.projectId);
          }
          if (url.pathname.endsWith("infoProcureDocAnnounZip")) {
            return jsonResponse({
              response: { responseCode: "0" },
              data: {
                projectId: fixture.projectId,
                zipId: fixture.invitation[0],
                buildName1: fixture.invitation[1],
                buildName2:
                  fixture.invitation[2] ||
                  `${fixture.projectId}-invitation-template`,
              },
            });
          }
          if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) {
            return jsonResponse({
              response: { responseCode: "0" },
              data: {
                projectId: fixture.projectId,
                zipId: fixture.draft[0],
                buildName1: fixture.draft[1],
                buildName2:
                  fixture.draft[2] || `${fixture.projectId}-draft-template`,
              },
            });
          }
          if (url.pathname.endsWith("infoProcureDocAnnounZipAdj")) {
            const itemNo = Number(url.searchParams.get("itemNo"));
            const adjusted = fixture.adjusted[itemNo - 1];
            return adjusted
              ? jsonResponse({
                  response: { responseCode: "0" },
                  data: [{
                    projectId: fixture.projectId,
                    itemNo,
                    zipId: adjusted[0],
                    buildName1: adjusted[1],
                    buildName2:
                      adjusted[2] ||
                      `${fixture.projectId}-draft-template-${itemNo}`,
                  }],
                })
              : confirmedMissingResponse();
          }
          const evidence = publicInvitationEvidenceResponse(
            url,
            true,
            true,
            fixture.draftType,
            fixture.draftAnnounceDate,
            fixture.invitationAnnounceDate
          );
          if (evidence) return evidence;
          throw new Error(`Unexpected request: ${url}`);
        },
      });

      const result = await discoverProjectDocuments(fixture.projectId, {
        egpAdapter: adapter,
      });

      assert.equal(result.documents.invitation.status, "available");
      assert.equal(result.documents.invitation.fileId, fixture.invitation[0]);
      assert.equal(result.documents.draftEbidding.status, "available");
      assert.equal(result.documents.draftEbidding.revision, fixture.expectedRevision);
      assert.equal(
        result.documents.draftEbidding.candidateCount,
        fixture.expectedCandidateCount ?? fixture.adjusted.length + 1
      );
      assert.equal(
        result.documents.draftEbidding.fileId,
        fixture.expectedRevision === 0
          ? fixture.draft[0]
          : fixture.adjusted[fixture.expectedRevision - 1][0]
      );
      assert.equal(result.documents.selectedProcurementDocument, "invitation");
    });
  }
});

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
    const evidence = publicInvitationEvidenceResponse(url);
    if (evidence) return evidence;
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
    const evidence = publicInvitationEvidenceResponse(url);
    if (evidence) return evidence;
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
    const evidence = publicInvitationEvidenceResponse(url);
    if (evidence) return evidence;
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

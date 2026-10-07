const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DOCUMENT_CATEGORY,
  DOWNLOAD_METHOD,
  ERROR_KIND,
  LOOKUP_METHOD,
  createNationalEgpAdapter,
  validateProjectId,
  getPriceEstimateMetadata,
  downloadLegacyZip,
  downloadZip,
} = require("../src/services/egp/egpClient");
const {
  createEgpRequestCoordinator,
  request,
} = require("../src/services/egp/client/transport");

test("validateProjectId accepts an 11-digit e-GP id", () => {
  assert.equal(validateProjectId("69089492262"), "69089492262");
  assert.throws(() => validateProjectId("../../secret"), /11 digits/);
});

test("getPriceEstimateMetadata maps the e-GP payload", async () => {
  const fetchImpl = async (url) => {
    assert.equal(url.searchParams.get("projectId"), "69089492262");
    return new Response(
      JSON.stringify({
        response: { responseCode: "0" },
        data: { zipFileId: "abc123", zipFileName: "price.zip" },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const result = await getPriceEstimateMetadata("69089492262", { fetchImpl });
  assert.deepEqual(result, {
    projectId: "69089492262",
    category: DOCUMENT_CATEGORY.PRICE_ESTIMATE,
    status: "available",
    source: "national_egp",
    lookupMethod: LOOKUP_METHOD.PRICE_PRIMARY,
    downloadMethod: DOWNLOAD_METHOD.FILE_ID,
    fileId: "abc123",
    fileName: "price.zip",
    downloadUrl:
      "https://process5.gprocurement.go.th/egp-upload-service/v1/downloadFileTest?fileId=abc123",
    lookupAttempts: [
      { lookupMethod: LOOKUP_METHOD.PRICE_PRIMARY, outcome: "available" },
    ],
  });
});

test("getPriceEstimateMetadata uses the project-service fallback", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });

    if (requests.length === 1) {
      return new Response(
        JSON.stringify({ response: { responseCode: "0" }, data: {} }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    assert.equal(
      url.pathname,
      "/egp-project-service/listProjectPriceBuildZipByProjectId"
    );
    assert.equal(options.headers.apikey, "test-project-service-key");
    return new Response(
      JSON.stringify({
        response: { responseCode: "0" },
        data: [
          {
            zipFileId: "fallback-file-id",
            priceBuildName: "pricebuild_67079622362.zip",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const result = await getPriceEstimateMetadata("67079622362", {
    fetchImpl,
    projectServiceApiKey: "test-project-service-key",
  });

  assert.equal(requests.length, 2);
  assert.deepEqual(result, {
    projectId: "67079622362",
    category: DOCUMENT_CATEGORY.PRICE_ESTIMATE,
    status: "available",
    source: "national_egp",
    lookupMethod: LOOKUP_METHOD.PRICE_PROJECT_SERVICE,
    downloadMethod: DOWNLOAD_METHOD.FILE_ID,
    fileId: "fallback-file-id",
    fileName: "pricebuild_67079622362.zip",
    downloadUrl:
      "https://process5.gprocurement.go.th/egp-upload-service/v1/downloadFileTest?fileId=fallback-file-id",
    lookupAttempts: [
      { lookupMethod: LOOKUP_METHOD.PRICE_PRIMARY, outcome: "not_found" },
      {
        lookupMethod: LOOKUP_METHOD.PRICE_PROJECT_SERVICE,
        outcome: "available",
      },
    ],
  });
});

test("getPriceEstimateMetadata uses the legacy green-book fallback", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });

    if (requests.length === 1) {
      return new Response(
        JSON.stringify({ response: { responseCode: "0" }, data: null }),
        { status: 200 }
      );
    }
    if (requests.length === 2) {
      return new Response(
        JSON.stringify({ response: { responseCode: "0" }, data: [] }),
        { status: 200 }
      );
    }
    if (requests.length === 3) {
      assert.equal(options.method, "POST");
      assert.ok(JSON.parse(options.body).key);
      return new Response(JSON.stringify({ data: "announcement-token" }), {
        status: 200,
      });
    }
    if (requests.length === 4) {
      assert.equal(options.headers["X-Announcement-Token"], "announcement-token");
      return new Response(
        JSON.stringify({
          data: { methodId: "22", announceType: "W0", isSect7: false },
        }),
        { status: 200 }
      );
    }

    assert.equal(url.pathname.endsWith("/greenBook"), true);
    return new Response(
      JSON.stringify({
        data: {
          greenBookAnnouncementTypeLinkDto: [
            {
              announceType: "BOQ",
              priceBuildName:
                "pricebuild_310000110000034_65117172803.zip",
            },
          ],
        },
      }),
      { status: 200 }
    );
  };

  const result = await getPriceEstimateMetadata("65117172803", {
    fetchImpl,
    projectServiceApiKey: "test-project-service-key",
  });

  assert.equal(requests.length, 5);
  assert.deepEqual(result, {
    projectId: "65117172803",
    category: DOCUMENT_CATEGORY.PRICE_ESTIMATE,
    status: "available",
    source: "national_egp",
    lookupMethod: LOOKUP_METHOD.PRICE_LEGACY_GREEN_BOOK,
    fileId: null,
    fileName: "pricebuild_310000110000034_65117172803.zip",
    downloadMethod: DOWNLOAD_METHOD.LEGACY_FILENAME,
    downloadUrl:
      "https://process3.gprocurement.go.th/egp2procmainWeb/FPRO9965AttachServ?projectId=65117172803&fileName=pricebuild_310000110000034_65117172803.zip",
    lookupAttempts: [
      { lookupMethod: LOOKUP_METHOD.PRICE_PRIMARY, outcome: "not_found" },
      {
        lookupMethod: LOOKUP_METHOD.PRICE_PROJECT_SERVICE,
        outcome: "not_found",
      },
      {
        lookupMethod: LOOKUP_METHOD.PRICE_LEGACY_GREEN_BOOK,
        outcome: "available",
      },
    ],
  });
});

function chunkedPriceDiscoveryFetch({ projectId, documentId, fileName, fileSize }) {
  return async (url, options = {}) => {
    if (url.pathname.endsWith("/infoDocPriceestZipHis")) {
      return new Response(
        JSON.stringify({ response: { responseCode: "0" }, data: null })
      );
    }
    if (url.pathname.endsWith("/listProjectPriceBuildZipByProjectId")) {
      return new Response(
        JSON.stringify({ response: { responseCode: "0" }, data: [] })
      );
    }
    if (url.pathname.endsWith("/generateToken")) {
      return new Response(JSON.stringify({ data: "announcement-token" }));
    }
    if (url.pathname.endsWith("/getProjectDetail")) {
      return new Response(
        JSON.stringify({
          data: {
            projectId,
            methodId: "22",
            announceType: "BOQ",
            projectStatus: "A",
            isSect7: false,
          },
        })
      );
    }
    if (url.pathname.endsWith("/greenBook")) {
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            greenBookAnnouncementTypeLinkDto: [
              { projectId, announceType: "BOQ", priceBuildName: documentId },
            ],
          },
        })
      );
    }
    if (url.pathname.endsWith("/getProcurementDetail")) {
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            projectId,
            typeProject: "9",
            flowAgencyFlag: "Y",
            flowAgencyType: "A",
          },
        })
      );
    }
    if (url.pathname.endsWith("/download-file-info")) {
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { docId: documentId });
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            chunkInfo: {
              projectId,
              docId: documentId,
              docType: "zip",
              fileName,
              chunkCount: fileSize > 2_000_000 ? 2 : 1,
              fileSize,
            },
          },
        })
      );
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
}

for (const fixture of [
  {
    projectId: "69099569802",
    documentId: "fe333a7a-f6d4-4292-93b3-ffa41780d365",
    fileName: "69099569802_pricebuild_2_25690928135834.zip",
    fileSize: 1_296_074,
  },
  {
    projectId: "69099641591",
    documentId: "77f8795e-e9a9-4a9a-a1a9-029ef10b8f45",
    fileName: "69099641591_pricebuild_2_25691002134424.zip",
    fileSize: 2_242_768,
  },
]) {
  test(`${fixture.projectId} discovers Price Estimate through the authoritative chunk flow`, async () => {
    const result = await getPriceEstimateMetadata(fixture.projectId, {
      fetchImpl: chunkedPriceDiscoveryFetch(fixture),
      projectServiceApiKey: "test-project-service-key",
    });

    assert.equal(result.status, "available");
    assert.equal(result.lookupMethod, LOOKUP_METHOD.PRICE_GREEN_BOOK_CHUNK);
    assert.equal(result.downloadMethod, DOWNLOAD_METHOD.CHUNKED_DOCUMENT);
    assert.equal(result.fileId, fixture.documentId);
    assert.equal(result.fileName, fixture.fileName);
    assert.equal(
      result.downloadUrl,
      `https://process5.gprocurement.go.th/egp-agpc01-web/common/download/${fixture.projectId}/${fixture.documentId}`
    );
    assert.deepEqual(
      result.lookupAttempts.map(({ lookupMethod, outcome }) => ({
        lookupMethod,
        outcome,
      })),
      [
        { lookupMethod: LOOKUP_METHOD.PRICE_PRIMARY, outcome: "not_found" },
        {
          lookupMethod: LOOKUP_METHOD.PRICE_PROJECT_SERVICE,
          outcome: "not_found",
        },
        {
          lookupMethod: LOOKUP_METHOD.PRICE_LEGACY_GREEN_BOOK,
          outcome: "not_found",
        },
        {
          lookupMethod: LOOKUP_METHOD.PRICE_GREEN_BOOK_CHUNK,
          outcome: "available",
        },
      ]
    );
  });
}

test("authoritative BOQ with an invalid UUID is an error, not not_found", async () => {
  const projectId = "69099569802";
  await assert.rejects(
    () =>
      getPriceEstimateMetadata(projectId, {
        fetchImpl: chunkedPriceDiscoveryFetch({
          projectId,
          documentId: "not-a-uuid",
          fileName: "unused.zip",
          fileSize: 100,
        }),
        projectServiceApiKey: "test-project-service-key",
      }),
    (error) => {
      assert.equal(error.code, "EGP_INVALID_CHUNK_DOCUMENT");
      assert.equal(error.kind, ERROR_KIND.INVALID_RESPONSE);
      assert.equal(error.details.lookupAttempts.at(-1).outcome, "error");
      return true;
    }
  );
});

test("authoritative BOQ with an unresolvable UUID is an error, not not_found", async () => {
  const projectId = "69099569802";
  const documentId = "fe333a7a-f6d4-4292-93b3-ffa41780d365";
  const normalFetch = chunkedPriceDiscoveryFetch({
    projectId,
    documentId,
    fileName: "unused.zip",
    fileSize: 100,
  });
  await assert.rejects(
    () =>
      getPriceEstimateMetadata(projectId, {
        fetchImpl: async (url, options) => {
          if (url.pathname.endsWith("/download-file-info")) {
            return new Response(
              JSON.stringify({ response: { responseCode: "404" }, data: null })
            );
          }
          return normalFetch(url, options);
        },
        projectServiceApiKey: "test-project-service-key",
      }),
    (error) => {
      assert.equal(error.code, "EGP_INVALID_CHUNK_DOCUMENT");
      assert.equal(error.kind, ERROR_KIND.INVALID_RESPONSE);
      assert.equal(error.details.lookupAttempts.at(-1).outcome, "error");
      return true;
    }
  );
});

test("recoverable primary failures continue to the project-service fallback", async () => {
  for (const primaryFailure of ["timeout", "http-500", "invalid-json"]) {
    let requestCount = 0;
    const fetchImpl = async () => {
      requestCount += 1;
      if (requestCount === 1) {
        if (primaryFailure === "timeout") {
          const error = new Error("timed out");
          error.name = "TimeoutError";
          throw error;
        }
        if (primaryFailure === "http-500") {
          return new Response("unavailable", { status: 500 });
        }
        return new Response("not-json", { status: 200 });
      }
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: [{ zipFileId: "fallback-id", priceBuildName: "fallback.zip" }],
        }),
        { status: 200 }
      );
    };

    const result = await getPriceEstimateMetadata("67079622362", {
      fetchImpl,
      maxRetries: 0,
      projectServiceApiKey: "test-key",
    });

    assert.equal(result.lookupMethod, LOOKUP_METHOD.PRICE_PROJECT_SERVICE);
    assert.equal(result.lookupAttempts[0].outcome, "error");
    assert.equal(result.lookupAttempts[1].outcome, "available");
  }
});

test("a missing fallback key skips that strategy and continues to legacy", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) {
      return new Response(JSON.stringify({ response: { responseCode: "0" }, data: null }));
    }
    if (requests.length === 2) {
      return new Response(JSON.stringify({ data: "announcement-token" }));
    }
    if (requests.length === 3) {
      return new Response(JSON.stringify({ data: { methodId: "22", isSect7: false } }));
    }
    return new Response(
      JSON.stringify({
        data: {
          greenBookAnnouncementTypeLinkDto: [
            {
              announceType: "BOQ",
              priceBuildName: "pricebuild_310000110000034_65117172803.zip",
            },
          ],
        },
      })
    );
  };

  const result = await getPriceEstimateMetadata("65117172803", {
    fetchImpl,
    projectServiceApiKey: "",
  });

  assert.equal(requests.length, 4);
  assert.equal(result.lookupMethod, LOOKUP_METHOD.PRICE_LEGACY_GREEN_BOOK);
  assert.equal(result.lookupAttempts[1].code, "EGP_FALLBACK_KEY_MISSING");
});

test("access and rate-limit responses stop the lookup chain", async () => {
  for (const status of [401, 403, 429]) {
    let requestCount = 0;
    const fetchImpl = async () => {
      requestCount += 1;
      return new Response("blocked", { status });
    };

    await assert.rejects(
      () =>
        getPriceEstimateMetadata("67079622362", {
          fetchImpl,
          maxRetries: 0,
          maxRateLimitRetries: 0,
          projectServiceApiKey: "test-key",
        }),
      (error) => {
        assert.equal(error.statusCode, status);
        assert.equal(
          error.kind,
          status === 429 ? ERROR_KIND.RATE_LIMITED : ERROR_KIND.ACCESS_DENIED
        );
        assert.equal(error.details.lookupAttempts.length, 1);
        return true;
      }
    );
    assert.equal(requestCount, 1);
  }
});

test("timeouts and 5xx responses use bounded retries", async () => {
  let requestCount = 0;
  const delays = [];
  const fetchImpl = async () => {
    requestCount += 1;
    if (requestCount < 3) return new Response("unavailable", { status: 503 });
    return new Response(
      JSON.stringify({
        response: { responseCode: "0" },
        data: { zipFileId: "retried-id", zipFileName: "retried.zip" },
      })
    );
  };

  const result = await getPriceEstimateMetadata("67079622362", {
    fetchImpl,
    maxRetries: 2,
    retryBaseDelayMs: 10,
    retryMaxDelayMs: 100,
    randomImpl: () => 0.5,
    sleepImpl: async (delay) => delays.push(delay),
  });

  assert.equal(result.fileId, "retried-id");
  assert.equal(requestCount, 3);
  assert.deepEqual(delays, [10, 20]);
});

test("National e-GP adapter hides the legacy download mechanism from callers", async () => {
  const zip = Buffer.from("PK\u0003\u0004adapter-legacy-zip");
  const requests = [];
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      requests.push(url);
      return new Response(zip, { status: 200 });
    },
  });

  const result = await adapter.downloadDocument({
    projectId: "65117172803",
    fileId: null,
    fileName: "pricebuild_310000110000034_65117172803.zip",
    downloadMethod: DOWNLOAD_METHOD.LEGACY_FILENAME,
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].hostname, "process3.gprocurement.go.th");
  assert.deepEqual(result, zip);
});

test("National e-GP adapter assembles a bounded chunked Price ZIP", async () => {
  const projectId = "69099641591";
  const documentId = "77f8795e-e9a9-4a9a-a1a9-029ef10b8f45";
  const zip = Buffer.from("PK\u0003\u0004chunked-price-zip");
  const chunks = [zip.subarray(0, 8), zip.subarray(8)];
  const requests = [];
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.pathname.endsWith("/download-file-info")) {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: {
              chunkInfo: {
                projectId,
                docId: documentId,
                docType: "zip",
                fileName: `${projectId}_pricebuild.zip`,
                chunkCount: chunks.length,
                fileSize: zip.length,
              },
            },
          })
        );
      }
      const requested = JSON.parse(options.body).chunkInfoDetail;
      const chunk = chunks[requested.chunkNo - 1];
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            chunkInfoDetail: {
              docId: documentId,
              chunkNo: requested.chunkNo,
              data: chunk.toString("base64"),
            },
          },
        })
      );
    },
  });

  const result = await adapter.downloadDocument({
    projectId,
    fileId: documentId,
    fileName: `${projectId}_pricebuild.zip`,
    downloadMethod: DOWNLOAD_METHOD.CHUNKED_DOCUMENT,
  });

  assert.deepEqual(result, zip);
  assert.equal(requests.length, 3);
  assert.deepEqual(JSON.parse(requests[0].options.body), { docId: documentId });
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    chunkInfoDetail: { chunkNo: 1, docId: documentId },
  });
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    chunkInfoDetail: { chunkNo: 2, docId: documentId },
  });
});

test("chunked Price download enforces declared size and ZIP signature", async () => {
  const projectId = "69099569802";
  const documentId = "fe333a7a-f6d4-4292-93b3-ffa41780d365";
  for (const fixture of [
    { payload: Buffer.from("PKshort"), declaredSize: 20, code: "EGP_INVALID_CHUNK_DOCUMENT" },
    { payload: Buffer.from("not-a-zip"), declaredSize: 9, code: "EGP_INVALID_ZIP" },
  ]) {
    const adapter = createNationalEgpAdapter({
      fetchImpl: async (url, options) => {
        if (url.pathname.endsWith("/download-file-info")) {
          return new Response(
            JSON.stringify({
              response: { responseCode: "0" },
              data: {
                chunkInfo: {
                  projectId,
                  docId: documentId,
                  docType: "zip",
                  fileName: `${projectId}_pricebuild.zip`,
                  chunkCount: 1,
                  fileSize: fixture.declaredSize,
                },
              },
            })
          );
        }
        assert.equal(JSON.parse(options.body).chunkInfoDetail.chunkNo, 1);
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: {
              chunkInfoDetail: { data: fixture.payload.toString("base64") },
            },
          })
        );
      },
    });

    await assert.rejects(
      () =>
        adapter.downloadDocument({
          projectId,
          fileId: documentId,
          fileName: `${projectId}_pricebuild.zip`,
          downloadMethod: DOWNLOAD_METHOD.CHUNKED_DOCUMENT,
        }),
      (error) => error.code === fixture.code
    );
  }
});

test("chunked Price download rejects declared files above the configured bound", async () => {
  let requestCount = 0;
  const adapter = createNationalEgpAdapter({
    fetchImpl: async () => {
      requestCount += 1;
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            chunkInfo: {
              projectId: "69099569802",
              docId: "fe333a7a-f6d4-4292-93b3-ffa41780d365",
              docType: "zip",
              fileName: "69099569802_pricebuild.zip",
              chunkCount: 1,
              fileSize: 101,
            },
          },
        })
      );
    },
  });

  await assert.rejects(
    () =>
      adapter.downloadDocument(
        {
          projectId: "69099569802",
          fileId: "fe333a7a-f6d4-4292-93b3-ffa41780d365",
          fileName: "69099569802_pricebuild.zip",
          downloadMethod: DOWNLOAD_METHOD.CHUNKED_DOCUMENT,
        },
        { maxBytes: 100 }
      ),
    (error) => error.code === "EGP_INVALID_CHUNK_DOCUMENT"
  );
  assert.equal(requestCount, 1);
});

test("adapter downloads a Legacy Draft through the verified anonymous POST contract", async () => {
  const zip = Buffer.from("PK\u0003\u0004legacy-draft-zip");
  let request;
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(zip, {
        status: 200,
        headers: {
          "content-type": "application/zip",
          "content-disposition":
            'attachment; filename="65077164290_25650831154250_2.zip"',
        },
      });
    },
  });

  const result = await adapter.downloadDocument({
    projectId: "65077164290",
    fileId: null,
    fileName: "65077164290_25650831154250_2.zip",
    downloadMethod: DOWNLOAD_METHOD.LEGACY_DRAFT_TRANSFER,
    legacyItemNo: 3,
    legacyTypeId: "04",
    legacyDocType: "adj",
    legacyMethodId: "16",
  });

  assert.deepEqual(result, zip);
  assert.equal(request.url.toString(),
    "https://file.gprocurement.go.th/EGPTransService/control.download"
  );
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.redirect, "manual");
  assert.equal(
    request.options.headers["Content-Type"],
    "application/x-www-form-urlencoded"
  );
  assert.equal(request.options.headers.cookie, undefined);
  assert.equal(request.options.headers["x-xsrf-token"], undefined);
  assert.deepEqual(Object.fromEntries(request.options.body), {
    proc_id: "",
    servlet: "",
    service: "D",
    projectId: "65077164290",
    methodId: "16",
    typeId: "04",
    itemNo: "3",
    subjectNo: "",
    subjectName: "",
    strAdd: "",
    mode: "public",
    seqNo: "",
    docType: "adj",
    docFlag: "",
    submitTin: "",
    attachSimulate: "",
    fileName: "65077164290_25650831154250_2.zip",
    partType: "z",
    branchNo: "",
    fieldname: "",
    fieldsize: "",
    num: "",
    realMethodId: "",
    announceSeq: "",
    considerSeqno: "",
  });
});

test("Legacy Draft download rejects invalid locators before making a request", async () => {
  let requestCount = 0;
  const adapter = createNationalEgpAdapter({
    fetchImpl: async () => {
      requestCount += 1;
      return new Response(Buffer.from("PK\u0003\u0004unexpected"));
    },
  });

  await assert.rejects(
    () =>
      adapter.downloadDocument({
        projectId: "65077164290",
        fileName: "65077164290_25650831154250_2.zip",
        downloadMethod: DOWNLOAD_METHOD.LEGACY_DRAFT_TRANSFER,
        legacyItemNo: 0,
        legacyTypeId: "04",
        legacyDocType: "temp",
        legacyMethodId: "16",
      }),
    (error) => error.code === "EGP_INVALID_LEGACY_DRAFT_LOCATOR"
  );
  assert.equal(requestCount, 0);
});

test("Legacy Draft download rejects an HTML transfer error as non-ZIP", async () => {
  const adapter = createNationalEgpAdapter({
    fetchImpl: async () =>
      new Response("<font>invalid item locator</font>", {
        status: 200,
        headers: { "content-type": "text/html;charset=TIS-620" },
      }),
  });

  await assert.rejects(
    () =>
      adapter.downloadDocument({
        projectId: "64117010720",
        fileName: "64117010720_25641104130520_2.zip",
        downloadMethod: DOWNLOAD_METHOD.LEGACY_DRAFT_TRANSFER,
        legacyItemNo: 0,
        legacyTypeId: "03",
        legacyDocType: "temp",
        legacyMethodId: "16",
      }),
    (error) => error.code === "EGP_INVALID_ZIP"
  );
});

function invitationEvidenceResponse(url, { hasInvitation = true } = {}) {
  if (url.pathname.endsWith("/generateToken")) {
    return new Response(JSON.stringify({ data: "announcement-token" }));
  }
  if (url.pathname.endsWith("/getProjectDetail")) {
    return new Response(
      JSON.stringify({
        data: { methodId: "16", announceType: hasInvitation ? "D0" : "B0" },
      })
    );
  }
  if (url.pathname.endsWith("/greenBook")) {
    return new Response(
      JSON.stringify({
        response: { responseCode: 0 },
        data: {
          greenBookAnnouncementTypeLinkDto: [
            hasInvitation
              ? { announceType: "D0", templateType: "D2", announceFlag: "A" }
              : {
                  announceType: "B0",
                  announceTypeDesc: "ร่างเอกสารประกวดราคา(e-Bidding)",
                  templateType: "D1",
                  announceFlag: "A",
                },
          ],
        },
      })
    );
  }
  return null;
}

function draftCategoryEvidenceResponse(url, draftType = "B0") {
  if (url.pathname.endsWith("/generateToken")) {
    return new Response(JSON.stringify({ data: "announcement-token" }));
  }
  if (url.pathname.endsWith("/getProjectDetail")) {
    return new Response(
      JSON.stringify({
        data: { methodId: "16", announceType: draftType, isSect7: false },
      })
    );
  }
  if (url.pathname.endsWith("/greenBook")) {
    return new Response(
      JSON.stringify({
        response: { responseCode: 0 },
        data: {
          greenBookAnnouncementTypeLinkDto: [
            {
              announceType: draftType,
              announceTypeDesc: "ร่างเอกสารประกวดราคา(e-Bidding)",
              templateType: "D1",
              announceFlag: "A",
            },
          ],
        },
      })
    );
  }
  return null;
}

test("invitation discovery maps a publicly confirmed bidding-document ZIP", async () => {
  const requested = [];
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url, options) => {
      requested.push({ url, options });
      if (url.pathname.endsWith("infoProcureDocAnnounZip")) {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: {
              projectId: "68059426756",
              zipId: "invitation-zip-id",
              buildName1: "68059426756_09062568_1.zip",
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
              buildName1: "68059426756_30052568.zip",
              buildName2: "draft-template-id",
            },
          })
        );
      }
      return invitationEvidenceResponse(url);
    },
  });

  const result = await adapter.discoverInvitation("68059426756");

  assert.equal(
    requested[0].url.pathname,
    "/egp-approval-service/apv-common/infoProcureDocAnnounZip"
  );
  assert.equal(requested[0].url.searchParams.get("projectId"), "68059426756");
  assert.equal(requested[0].options.headers.noToken, "noToken");
  assert.equal(requested[0].options.headers.noDataProfile, "noDataProfile");
  assert.deepEqual(result, {
    projectId: "68059426756",
    category: DOCUMENT_CATEGORY.INVITATION,
    status: "available",
    source: "national_egp",
    lookupMethod: LOOKUP_METHOD.INVITATION_APPROVAL_FINAL,
    downloadMethod: DOWNLOAD_METHOD.FILE_ID,
    fileId: "invitation-zip-id",
    fileName: "68059426756_09062568_1.zip",
    announcementTemplateId: "announcement-template-id",
    downloadUrl:
      "https://process5.gprocurement.go.th/egp-upload-service/v1/downloadFileTest?fileId=invitation-zip-id",
  });
});

test("confirmed public absence does not mistake a shared Draft Temp ZIP for Invitation", async () => {
  const sharedData = {
    projectId: "68059426756",
    zipId: "shared-draft-id",
    buildName1: "68059426756_30052568.zip",
    buildName2: "shared-template-id",
  };
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      if (
        url.pathname.endsWith("infoProcureDocAnnounZip") ||
        url.pathname.endsWith("infoProcureDocAnnounZipTemp")
      ) {
        return new Response(
          JSON.stringify({ response: { responseCode: "0" }, data: sharedData })
        );
      }
      return invitationEvidenceResponse(url, { hasInvitation: false });
    },
  });

  const result = await adapter.discoverInvitation("68059426756");

  assert.equal(result.status, "not_found");
  assert.equal(result.fileId, null);
  assert.equal(result.downloadUrl, null);
  assert.equal("announcementTemplateId" in result, false);
});

test("public D0 with incomplete ZIP metadata is an error, not not_found", async () => {
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("infoProcureDocAnnounZip")) {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: { zipId: null, buildName1: null, buildName2: "template-only" },
          })
        );
      }
      if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) {
        return new Response(
          JSON.stringify({ response: { responseCode: "1" }, data: null })
        );
      }
      return invitationEvidenceResponse(url);
    },
  });

  await assert.rejects(
    () => adapter.discoverInvitation("68059426756"),
    (error) => error.code === "EGP_INVITATION_CATEGORY_CONFLICT"
  );
});

test("Invitation category evidence failure remains an error", async () => {
  const adapter = createNationalEgpAdapter({
    maxRetries: 0,
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("infoProcureDocAnnounZip")) {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: { zipId: "candidate-id", buildName1: "candidate.zip" },
          })
        );
      }
      if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) {
        return new Response(
          JSON.stringify({ response: { responseCode: "1" }, data: null })
        );
      }
      if (url.pathname.endsWith("/generateToken")) {
        return new Response(JSON.stringify({ data: "announcement-token" }));
      }
      if (url.pathname.endsWith("/getProjectDetail")) {
        return new Response(JSON.stringify({ data: { methodId: "16" } }));
      }
      return new Response(
        JSON.stringify({ response: { responseCode: 0 }, data: {} })
      );
    },
  });

  await assert.rejects(
    () => adapter.discoverInvitation("68059426756"),
    (error) => error.code === "EGP_INVITATION_CATEGORY_UNVERIFIED"
  );
});

test("temporary Draft Temp correlation failure never becomes Invitation not_found", async () => {
  const adapter = createNationalEgpAdapter({
    maxRetries: 0,
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("infoProcureDocAnnounZip")) {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: { zipId: "candidate-id", buildName1: "candidate.zip" },
          })
        );
      }
      const error = new Error("temporary upstream timeout");
      error.name = "TimeoutError";
      throw error;
    },
  });

  await assert.rejects(
    () => adapter.discoverInvitation("68059426756"),
    (error) => error.code === "EGP_TIMEOUT" && error.kind === ERROR_KIND.RECOVERABLE
  );
});

test("all six shared-locator regressions require public D0 evidence", async (t) => {
  const fixtures = [
    ["69059292256", "0d8308d6782b41d488c8cb0249d2aea7", "69059292256_10062569.zip", "49a3e8de-9ca3-4ce5-9031-0ca16f28e353"],
    ["69109005145", "b3c9f94cecad46169655a3982f5bccb4", "69109005145_01102569.zip", "10841a5c-44e0-4bb0-a4a1-9943a58b85a2"],
    ["69099683466", "f1faa5e84e2f49059f048095f58e1b87", "69099683466_30092569.zip", "89180019-442b-445d-9e9e-7239d9e8862c"],
    ["68109235287", "3c647d6c9b404104ac21a4e917d6262b", "68109235287_01092569.zip", "f53ae7e5-73de-4080-beb6-82a3dedd9124"],
    ["68049412254", "216ec993eccb474cb5a95c3d062ec012", "68049412254_30042568.zip", "b5372f65-b800-434a-b6ae-514928e98561"],
    ["67119566073", "3b38515f2fad46dca4690d04ad7aeef4", "67119566073_02122567.zip", "2a1f4485-5a34-4031-8296-ec2ea7cbe15a"],
  ];

  for (const [projectId, zipId, buildName1, buildName2] of fixtures) {
    await t.test(projectId, async () => {
      const data = { projectId, zipId, buildName1, buildName2 };
      const adapter = createNationalEgpAdapter({
        fetchImpl: async (url) => {
          if (
            url.pathname.endsWith("infoProcureDocAnnounZip") ||
            url.pathname.endsWith("infoProcureDocAnnounZipTemp")
          ) {
            return new Response(
              JSON.stringify({ response: { responseCode: "0" }, data })
            );
          }
          return invitationEvidenceResponse(url, { hasInvitation: false });
        },
      });

      const result = await adapter.discoverInvitation(projectId);
      assert.equal(result.status, "not_found");
      assert.equal(result.fileId, null);
    });
  }
});

test("identical filenames with different IDs remain eligible when D0 is present", async () => {
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("infoProcureDocAnnounZip")) {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: {
              zipId: "invitation-id",
              buildName1: "same-name.zip",
              buildName2: "invitation-template",
            },
          })
        );
      }
      if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: {
              zipId: "draft-id",
              buildName1: "same-name.zip",
              buildName2: "draft-template",
            },
          })
        );
      }
      return invitationEvidenceResponse(url);
    },
  });

  const result = await adapter.discoverInvitation("68059426756");
  assert.equal(result.status, "available");
  assert.equal(result.fileId, "invitation-id");
});

test("reported D0 Invitation projects and positive control map their final ZIP", async (t) => {
  const fixtures = [
    ["69049472497", "c3918846ea6144cc9bc54af654f87186", "69049472497_27092569_3.zip"],
    ["69099475279", "e8fc5803640042d7a12f31f65eb477f8", "69099475279_27092569_1.zip"],
    ["69099257828", "db718d01999d4bfdb5eab1a56188d23c", "69099257828_28092569_1.zip"],
    ["69099014571", "571079984dd44e78bc9a7959805d9734", "69099014571_28092569_2.zip"],
    ["69019550258", "33d37eb898884aefa0a846119c81f3d6", "69019550258_25092569_3.zip"],
    ["69099444939", "adfb93a49f4849749069816a3611d045", "69099444939_24092569_1.zip"],
    ["69099328758", "b287e644cc2f474f968b3bf2906175de", "69099328758_23092569_1.zip"],
    ["69099283920", "fbc39d9eeba54c95ae12c3acd7fc607b", "69099283920_22092569_1.zip"],
    ["69049212278", "848db15f4acf46d2935526b60e7c3008", "69049212278_21092569_1.zip"],
    ["69019529847", "bf717f519a654c1dbf0bed1c5d14354f", "69019529847_30092569_4.zip"],
  ];

  for (const [projectId, fileId, fileName] of fixtures) {
    await t.test(projectId, async () => {
      const adapter = createNationalEgpAdapter({
        maxRetries: 0,
        fetchImpl: async (url) => {
          if (url.pathname.endsWith("infoProcureDocAnnounZip")) {
            return new Response(
              JSON.stringify({
                response: { responseCode: "0" },
                data: {
                  projectId,
                  zipId: fileId,
                  buildName1: fileName,
                  buildName2: `${projectId}-announcement-template`,
                },
              })
            );
          }
          if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) {
            return new Response(
              JSON.stringify({
                response: { responseCode: "0" },
                data: {
                  projectId,
                  zipId: `${projectId}-draft-id`,
                  buildName1: `${projectId}_draft.zip`,
                  buildName2: `${projectId}-draft-template`,
                },
              })
            );
          }
          return invitationEvidenceResponse(url);
        },
      });

      const result = await adapter.discoverInvitation(projectId);
      assert.equal(result.status, "available");
      assert.equal(result.lookupMethod, LOOKUP_METHOD.INVITATION_APPROVAL_FINAL);
      assert.equal(result.fileId, fileId);
      assert.equal(result.fileName, fileName);
    });
  }
});

test("HTTP 200 rate-limit body is retried before valid JSON", async () => {
  let tokenAttempts = 0;
  const delays = [];
  const adapter = createNationalEgpAdapter({
    maxRetries: 0,
    maxRateLimitRetries: 1,
    rateLimitRetryBaseDelayMs: 10,
    rateLimitRetryMaxDelayMs: 10,
    randomImpl: () => 0.5,
    sleepImpl: async (delayMs) => delays.push(delayMs),
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("infoProcureDocAnnounZip")) {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: {
              zipId: "invitation-id",
              buildName1: "invitation.zip",
              buildName2: "invitation-template",
            },
          })
        );
      }
      if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) {
        return new Response(
          JSON.stringify({ response: { responseCode: "1" }, data: null })
        );
      }
      if (url.pathname.endsWith("/generateToken") && tokenAttempts++ === 0) {
        return new Response("Rate limit exceeded. Try again later.");
      }
      return invitationEvidenceResponse(url);
    },
  });

  const result = await adapter.discoverInvitation("69049472497");
  assert.equal(result.status, "available");
  assert.equal(tokenAttempts, 2);
  assert.deepEqual(delays, [10]);
});

test("multiple HTTP 200 throttles use bounded exponential backoff", async () => {
  let requestCount = 0;
  const delays = [];
  const result = await getPriceEstimateMetadata("69049472497", {
    maxRetries: 0,
    maxRateLimitRetries: 2,
    rateLimitRetryBaseDelayMs: 1_000,
    rateLimitRetryMaxDelayMs: 8_000,
    randomImpl: () => 0.5,
    sleepImpl: async (delayMs) => delays.push(delayMs),
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount < 3) {
        return new Response("Rate limit exceeded. Try again later.");
      }
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: { zipFileId: "price-id", zipFileName: "price.zip" },
        }),
        { headers: { "content-type": "application/json" } }
      );
    },
  });

  assert.equal(result.fileId, "price-id");
  assert.equal(requestCount, 3);
  assert.deepEqual(delays, [1_000, 2_000]);
});

test("rate-limit retry exhaustion remains EGP_RATE_LIMITED", async () => {
  let requestCount = 0;
  const delays = [];
  await assert.rejects(
    () =>
      getPriceEstimateMetadata("69049472497", {
        maxRetries: 0,
        maxRateLimitRetries: 2,
        rateLimitRetryBaseDelayMs: 1_000,
        rateLimitRetryMaxDelayMs: 8_000,
        randomImpl: () => 0.5,
        sleepImpl: async (delayMs) => delays.push(delayMs),
        fetchImpl: async () => {
          requestCount += 1;
          return new Response("Rate limit exceeded. Try again later.");
        },
      }),
    (error) =>
      error.code === "EGP_RATE_LIMITED" &&
      error.kind === ERROR_KIND.RATE_LIMITED
  );
  assert.equal(requestCount, 3);
  assert.deepEqual(delays, [1_000, 2_000]);
});

test("shared coordinator applies escalating global cooldown and adaptive pacing", async () => {
  let now = 0;
  const delays = [];
  const coordinator = createEgpRequestCoordinator({
    minIntervalMs: 500,
    maxIntervalMs: 4_000,
    cooldownBaseMs: 10_000,
    cooldownMaxMs: 60_000,
    recoverySuccesses: 2,
    randomImpl: () => 0.5,
    nowImpl: () => now,
    sleepImpl: async (delayMs) => {
      delays.push(delayMs);
      now += delayMs;
    },
  });

  await coordinator.wait();
  coordinator.recordRequest();
  coordinator.recordRateLimit();
  coordinator.recordRateLimitRetry();
  assert.equal(coordinator.getDiagnostics().currentRequestIntervalMs, 1_000);

  await coordinator.wait();
  coordinator.recordRequest();
  coordinator.recordRateLimit();
  coordinator.recordRateLimitRetry();
  assert.equal(coordinator.getDiagnostics().currentRequestIntervalMs, 2_000);

  await coordinator.wait();
  coordinator.recordRequest();
  coordinator.recordRateLimit();
  coordinator.recordRetryExhaustion();

  assert.deepEqual(delays, [10_000, 30_000]);
  assert.deepEqual(coordinator.getDiagnostics(), {
    egpRequestsTotal: 3,
    rateLimitResponses: 3,
    rateLimitRetries: 2,
    successfulRetries: 0,
    retryExhaustionCount: 1,
    globalCooldownCount: 3,
    globalCooldownMs: 100_000,
    maxConsecutiveRateLimits: 3,
    exhaustionRecoveryAttempts: 0,
    successfulExhaustionRecoveries: 0,
    rateLimitResponsesByEndpoint: { unknown: 3 },
    retryExhaustionsByEndpoint: { unknown: 1 },
    baseRequestIntervalMs: 500,
    currentRequestIntervalMs: 4_000,
    maxRequestIntervalMs: 4_000,
    cooldownRemainingMs: 60_000,
  });

  coordinator.recordSuccess();
  coordinator.recordSuccess();
  assert.equal(coordinator.getDiagnostics().currentRequestIntervalMs, 2_000);
});

test("all rate-limit retries re-enter the shared coordinator", async () => {
  let now = 0;
  const requestTimes = [];
  const coordinator = createEgpRequestCoordinator({
    minIntervalMs: 500,
    maxIntervalMs: 4_000,
    cooldownBaseMs: 10_000,
    cooldownMaxMs: 60_000,
    recoverySuccesses: 10,
    randomImpl: () => 0.5,
    nowImpl: () => now,
    sleepImpl: async (delayMs) => {
      now += delayMs;
    },
  });
  let attempts = 0;

  const response = await request(new URL("https://example.test/metadata"), {
    maxRetries: 0,
    maxRateLimitRetries: 2,
    requestCoordinator: coordinator,
    fetchImpl: async () => {
      requestTimes.push(now);
      attempts += 1;
      if (attempts < 3) {
        return new Response("Rate limit exceeded. Try again later.", {
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response("{}", {
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(response.ok, true);
  assert.deepEqual(requestTimes, [0, 10_000, 40_000]);
  assert.deepEqual(coordinator.getDiagnostics(), {
    egpRequestsTotal: 3,
    rateLimitResponses: 2,
    rateLimitRetries: 2,
    successfulRetries: 1,
    retryExhaustionCount: 0,
    globalCooldownCount: 2,
    globalCooldownMs: 40_000,
    maxConsecutiveRateLimits: 2,
    exhaustionRecoveryAttempts: 0,
    successfulExhaustionRecoveries: 0,
    rateLimitResponsesByEndpoint: {
      "GET /metadata": 2,
    },
    retryExhaustionsByEndpoint: {},
    baseRequestIntervalMs: 500,
    currentRequestIntervalMs: 2_000,
    maxRequestIntervalMs: 4_000,
    cooldownRemainingMs: 0,
  });
});

test("final rate-limit recovery waits through the cooldown that ordinary retries triggered", async () => {
  let now = 0;
  const requestTimes = [];
  const coordinator = createEgpRequestCoordinator({
    minIntervalMs: 500,
    maxIntervalMs: 4_000,
    cooldownBaseMs: 10_000,
    cooldownMaxMs: 60_000,
    recoverySuccesses: 10,
    randomImpl: () => 0.5,
    nowImpl: () => now,
    sleepImpl: async (delayMs) => {
      now += delayMs;
    },
  });
  let attempts = 0;

  const response = await request(
    new URL("https://example.test/egp/approval/final"),
    {
      maxRetries: 0,
      maxRateLimitRetries: 3,
      maxRateLimitExhaustionRecoveryRetries: 1,
      requestCoordinator: coordinator,
      fetchImpl: async () => {
        requestTimes.push(now);
        attempts += 1;
        if (attempts <= 4) {
          return new Response("Rate limit exceeded. Try again later.", {
            headers: { "content-type": "text/plain" },
          });
        }
        return new Response("{}", {
          headers: { "content-type": "application/json" },
        });
      },
    }
  );

  assert.equal(response.ok, true);
  assert.deepEqual(requestTimes, [0, 10_000, 40_000, 100_000, 160_000]);
  const diagnostics = coordinator.getDiagnostics();
  assert.equal(diagnostics.rateLimitResponses, 4);
  assert.equal(diagnostics.rateLimitRetries, 4);
  assert.equal(diagnostics.exhaustionRecoveryAttempts, 1);
  assert.equal(diagnostics.successfulExhaustionRecoveries, 1);
  assert.equal(diagnostics.retryExhaustionCount, 0);
  assert.deepEqual(diagnostics.rateLimitResponsesByEndpoint, {
    "GET /egp/approval/final": 4,
  });
  assert.deepEqual(diagnostics.retryExhaustionsByEndpoint, {});
});

test("persistent throttling after final recovery records the exact endpoint", async () => {
  let now = 0;
  const coordinator = createEgpRequestCoordinator({
    minIntervalMs: 500,
    maxIntervalMs: 4_000,
    cooldownBaseMs: 10_000,
    cooldownMaxMs: 60_000,
    randomImpl: () => 0.5,
    nowImpl: () => now,
    sleepImpl: async (delayMs) => {
      now += delayMs;
    },
  });

  await assert.rejects(
    () =>
      request(new URL("https://example.test/egp/announcement/greenBook"), {
        maxRetries: 0,
        maxRateLimitRetries: 3,
        maxRateLimitExhaustionRecoveryRetries: 1,
        requestCoordinator: coordinator,
        fetchImpl: async () =>
          new Response("Rate limit exceeded. Try again later.", {
            headers: { "content-type": "text/plain" },
          }),
      }),
    (error) =>
      error.code === "EGP_RATE_LIMITED" &&
      error.upstreamEndpoint === "GET /egp/announcement/greenBook"
  );

  const diagnostics = coordinator.getDiagnostics();
  assert.equal(diagnostics.egpRequestsTotal, 5);
  assert.equal(diagnostics.exhaustionRecoveryAttempts, 1);
  assert.equal(diagnostics.successfulExhaustionRecoveries, 0);
  assert.equal(diagnostics.retryExhaustionCount, 1);
  assert.deepEqual(diagnostics.rateLimitResponsesByEndpoint, {
    "GET /egp/announcement/greenBook": 5,
  });
  assert.deepEqual(diagnostics.retryExhaustionsByEndpoint, {
    "GET /egp/announcement/greenBook": 1,
  });
});

test("National e-GP adapter paces requests across discovery calls", async () => {
  let now = 0;
  const waits = [];
  const starts = [];
  const adapter = createNationalEgpAdapter({
    minRequestIntervalMs: 100,
    nowImpl: () => now,
    pacingSleepImpl: async (delayMs) => {
      waits.push(delayMs);
      now += delayMs;
    },
    fetchImpl: async () => {
      starts.push(now);
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: { zipFileId: `price-${starts.length}`, zipFileName: "price.zip" },
        }),
        { headers: { "content-type": "application/json" } }
      );
    },
  });

  await adapter.discoverPriceEstimate("69049472497");
  await adapter.discoverPriceEstimate("69099475279");

  assert.deepEqual(starts, [0, 100]);
  assert.deepEqual(waits, [100]);
});

test("shared transport recovers periodic throttling across project requests", async () => {
  const attempts = new Map();
  const delays = [];
  const adapter = createNationalEgpAdapter({
    maxRetries: 0,
    maxRateLimitRetries: 1,
    rateLimitRetryBaseDelayMs: 25,
    rateLimitRetryMaxDelayMs: 25,
    randomImpl: () => 0.5,
    sleepImpl: async (delayMs) => delays.push(delayMs),
    fetchImpl: async (url) => {
      const projectId = url.searchParams.get("projectId");
      const attempt = (attempts.get(projectId) || 0) + 1;
      attempts.set(projectId, attempt);
      if (attempt === 1) {
        return new Response("Rate limit exceeded. Try again later.");
      }
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            zipFileId: `price-${projectId}`,
            zipFileName: `${projectId}.zip`,
          },
        }),
        { headers: { "content-type": "application/json" } }
      );
    },
  });
  const projectIds = ["69049472497", "69099475279", "69099257828"];

  const results = [];
  for (const projectId of projectIds) {
    results.push(await adapter.discoverPriceEstimate(projectId));
  }

  assert.deepEqual(
    results.map(({ status }) => status),
    ["available", "available", "available"]
  );
  assert.deepEqual([...attempts.values()], [2, 2, 2]);
  assert.deepEqual(delays, [25, 25, 25]);
});

test("draft e-bidding discovery selects the only valid initial ZIP", async () => {
  const requested = [];
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      requested.push(url);
      const evidence = draftCategoryEvidenceResponse(url);
      if (evidence) return evidence;
      if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: {
              zipId: "draft-initial-id",
              buildName1: "68059426756_30052568.zip",
            },
          })
        );
      }
      assert.equal(url.searchParams.get("itemNo"), "1");
      return new Response(
        JSON.stringify({
          response: { responseCode: "1" },
          data: null,
        })
      );
    },
  });

  const result = await adapter.discoverDraftEbidding("68059426756");

  assert.equal(requested.length, 5);
  assert.equal(result.category, DOCUMENT_CATEGORY.DRAFT_EBIDDING);
  assert.equal(result.status, "available");
  assert.equal(result.lookupMethod, LOOKUP_METHOD.DRAFT_TEMP);
  assert.equal(result.fileId, "draft-initial-id");
  assert.equal(result.revision, 0);
  assert.equal(result.version, "initial");
  assert.equal(result.candidateCount, 1);
});

test("complete D0-only evidence rejects a Temp locator as Draft", async () => {
  let process5Requests = 0;
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      const evidence = invitationEvidenceResponse(url);
      if (evidence) return evidence;
      process5Requests += 1;
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            zipId: "invitation-alias-id",
            buildName1: "invitation-alias.zip",
          },
        })
      );
    },
  });

  const result = await adapter.discoverDraftEbidding("67049364890");

  assert.equal(result.status, "not_found");
  assert.equal(result.lookupMethod, LOOKUP_METHOD.DRAFT_PUBLIC_CATEGORY);
  assert.equal(result.fileId, null);
  assert.equal(process5Requests, 0);
});

test("unknown Draft-like GreenBook evidence remains an error", async () => {
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("/generateToken")) {
        return new Response(JSON.stringify({ data: "announcement-token" }));
      }
      if (url.pathname.endsWith("/getProjectDetail")) {
        return new Response(
          JSON.stringify({ data: { methodId: "16", announceType: "B2" } })
        );
      }
      if (url.pathname.endsWith("/greenBook")) {
        return new Response(
          JSON.stringify({
            response: { responseCode: 0 },
            data: {
              greenBookAnnouncementTypeLinkDto: [
                {
                  announceType: "B2",
                  templateType: "D1",
                  announceFlag: "A",
                },
              ],
            },
          })
        );
      }
      throw new Error(`Unexpected Process 5 request: ${url}`);
    },
  });

  await assert.rejects(
    () => adapter.discoverDraftEbidding("67049364890"),
    (error) => error.code === "EGP_DRAFT_CATEGORY_UNVERIFIED"
  );
});

test("incomplete Draft category evidence remains an error", async () => {
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("/generateToken")) {
        return new Response(JSON.stringify({ data: "announcement-token" }));
      }
      if (url.pathname.endsWith("/getProjectDetail")) {
        return new Response(
          JSON.stringify({ data: { methodId: "16", announceType: "D0" } })
        );
      }
      return new Response(
        JSON.stringify({ response: { responseCode: 0 }, data: {} })
      );
    },
  });

  await assert.rejects(
    () => adapter.discoverDraftEbidding("67049364890"),
    (error) => error.code === "EGP_DRAFT_CATEGORY_UNVERIFIED"
  );
});

test("draft e-bidding discovery selects the highest explicit revision", async () => {
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      const evidence = draftCategoryEvidenceResponse(url, "B3");
      if (evidence) return evidence;
      if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: { zipId: "draft-0", buildName1: "draft-0.zip" },
          })
        );
      }

      const itemNo = Number(url.searchParams.get("itemNo"));
      if (itemNo <= 2) {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: [
              {
                // The upstream item's own itemNo is deliberately unhelpful;
                // selection must use the explicit revision requested in the URL.
                itemNo: 0,
                zipId: `draft-${itemNo}`,
                buildName1: `draft-${itemNo}.zip`,
              },
            ],
          })
        );
      }
      return new Response(
        JSON.stringify({ response: { responseCode: "1" }, data: null })
      );
    },
  });

  const result = await adapter.discoverDraftEbidding("68059426756");

  assert.equal(result.status, "available");
  assert.equal(result.lookupMethod, LOOKUP_METHOD.DRAFT_ADJUSTED);
  assert.equal(result.fileId, "draft-2");
  assert.equal(result.revision, 2);
  assert.equal(result.version, "revision_2");
  assert.equal(result.candidateCount, 3);
});

test("draft e-bidding discovery reports conflicting latest ZIPs as ambiguous", async () => {
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      const evidence = draftCategoryEvidenceResponse(url);
      if (evidence) return evidence;
      if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) {
        return new Response(
          JSON.stringify({ response: { responseCode: "1" }, data: null })
        );
      }
      if (url.searchParams.get("itemNo") === "1") {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: [
              { zipId: "conflict-a", buildName1: "conflict-a.zip" },
              { zipId: "conflict-b", buildName1: "conflict-b.zip" },
            ],
          })
        );
      }
      return new Response(
        JSON.stringify({ response: { responseCode: "1" }, data: null })
      );
    },
  });

  const result = await adapter.discoverDraftEbidding("68059426756");

  assert.equal(result.status, "ambiguous");
  assert.equal(result.fileId, null);
  assert.equal(result.downloadUrl, null);
  assert.equal(result.candidateCount, 2);
  assert.equal(result.ambiguityReason, "conflicting_latest_revision");
});

test("draft e-bidding discovery does not select when the revision cap is reached", async () => {
  const adapter = createNationalEgpAdapter({
    maxDraftRevisions: 1,
    fetchImpl: async (url) => {
      const evidence = draftCategoryEvidenceResponse(url);
      if (evidence) return evidence;
      if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) {
        return new Response(
          JSON.stringify({
            response: { responseCode: "0" },
            data: { zipId: "draft-0", buildName1: "draft-0.zip" },
          })
        );
      }
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: [{ zipId: "draft-1", buildName1: "draft-1.zip" }],
        })
      );
    },
  });

  const result = await adapter.discoverDraftEbidding("68059426756");

  assert.equal(result.status, "ambiguous");
  assert.equal(result.ambiguityReason, "revision_limit_reached");
  assert.equal(result.fileId, null);
});

function confirmedMissingDraftResponse() {
  return new Response(
    JSON.stringify({
      response: { responseCode: "1", messageCode: "E0001" },
      data: null,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function legacyDraftResponse(data) {
  return new Response(
    JSON.stringify({ response: { responseCode: 0, responseDesc: "" }, data }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function legacyDraftRecord({
  projectId,
  buildName,
  webDate,
  stepId,
  commentFDate = null,
}) {
  return { projectId, buildName, webDate, commentFDate, stepId };
}

test("confirmed Process 5 absence falls back to one Legacy Draft", async () => {
  const requested = [];
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      requested.push(url);
      const evidence = draftCategoryEvidenceResponse(url);
      if (evidence) return evidence;
      if (!url.pathname.endsWith("getTorZipList")) {
        return confirmedMissingDraftResponse();
      }
      if (url.searchParams.get("typeId") === "03") {
        return legacyDraftResponse([
          legacyDraftRecord({
            projectId: "64117010720",
            buildName: "64117010720_25641104130520_2.zip",
            webDate: "2021-11-03T17:00:00.000Z",
            commentFDate: "2021-11-08T17:00:00.000Z",
            stepId: "D03",
          }),
        ]);
      }
      return legacyDraftResponse([]);
    },
  });

  const result = await adapter.discoverDraftEbidding("64117010720");

  assert.equal(requested.length, 7);
  assert.equal(result.status, "available");
  assert.equal(result.lookupMethod, LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC);
  assert.equal(result.downloadMethod, DOWNLOAD_METHOD.LEGACY_DRAFT_TRANSFER);
  assert.equal(result.fileId, null);
  assert.equal(result.fileName, "64117010720_25641104130520_2.zip");
  assert.equal(result.legacyItemNo, 0);
  assert.equal(result.legacyTypeId, "03");
  assert.equal(result.legacyDocType, "temp");
  assert.equal(result.legacyMethodId, "16");
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].legacyItemNo, 0);
  assert.equal(
    result.downloadUrl,
    "https://file.gprocurement.go.th/EGPTransService/control.download"
  );
  assert.deepEqual(result.lookupAttempts, [
    { lookupMethod: LOOKUP_METHOD.DRAFT_TEMP, outcome: "not_found" },
    { lookupMethod: LOOKUP_METHOD.DRAFT_ADJUSTED, outcome: "not_found" },
    { lookupMethod: LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC, outcome: "available" },
  ]);
});

test("multiple Legacy Drafts select the newest timestamp and retain its source locator", async () => {
  const projectId = "65077164290";
  const records = [
    legacyDraftRecord({
      projectId,
      buildName: "65077164290_25650805170219_2.zip",
      webDate: "2022-08-04T17:00:00.000Z",
      stepId: "D03",
    }),
    legacyDraftRecord({
      projectId,
      buildName: "65077164290_25650816165634_2.zip",
      webDate: "2022-08-15T17:00:00.000Z",
      stepId: "U03",
    }),
    legacyDraftRecord({
      projectId,
      buildName: "65077164290_25650830164828_2.zip",
      webDate: "2022-08-29T17:00:00.000Z",
      stepId: "U03",
    }),
    legacyDraftRecord({
      projectId,
      buildName: "65077164290_25650831154250_2.zip",
      webDate: "2022-08-30T17:00:00.000Z",
      stepId: "U03",
    }),
  ];
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      const evidence = draftCategoryEvidenceResponse(url);
      if (evidence) return evidence;
      return url.pathname.endsWith("getTorZipList")
        ? legacyDraftResponse(records)
        : confirmedMissingDraftResponse();
    },
  });

  const result = await adapter.discoverDraftEbidding(projectId);

  assert.equal(result.status, "available");
  assert.equal(result.fileName, "65077164290_25650831154250_2.zip");
  assert.equal(result.candidateCount, 4);
  assert.equal(result.legacyItemNo, 3);
  assert.equal(result.legacyTypeId, "04");
  assert.equal(result.legacyDocType, "adj");
  assert.equal(result.candidates.length, 4);
  assert.equal(
    result.candidates.find(({ fileName }) =>
      fileName.endsWith("25650831154250_2.zip")
    ).legacyItemNo,
    3
  );
});

test("Process 5 and Legacy Draft confirmed absence returns not_found", async () => {
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      const evidence = draftCategoryEvidenceResponse(url);
      if (evidence) return evidence;
      return url.pathname.endsWith("getTorZipList")
        ? legacyDraftResponse([])
        : confirmedMissingDraftResponse();
    },
  });

  const result = await adapter.discoverDraftEbidding("67079622362");

  assert.equal(result.status, "not_found");
  assert.equal(result.lookupMethod, LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC);
  assert.equal(result.fileId, null);
  assert.deepEqual(result.lookupAttempts.at(-1), {
    lookupMethod: LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC,
    outcome: "not_found",
  });
});

test("Legacy Draft discovery failure remains an error", async () => {
  const adapter = createNationalEgpAdapter({
    maxRetries: 0,
    fetchImpl: async (url) => {
      const evidence = draftCategoryEvidenceResponse(url);
      if (evidence) return evidence;
      return url.pathname.endsWith("getTorZipList")
        ? new Response("forbidden", { status: 403 })
        : confirmedMissingDraftResponse();
    },
  });

  await assert.rejects(
    () => adapter.discoverDraftEbidding("67079622362"),
    (error) => {
      assert.equal(error.kind, ERROR_KIND.ACCESS_DENIED);
      assert.equal(error.details.lookupAttempts.at(-1).outcome, "error");
      assert.equal(
        error.details.lookupAttempts.at(-1).lookupMethod,
        LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC
      );
      return true;
    }
  );
});

test("conflicting newest Legacy Draft candidates return ambiguous", async () => {
  const projectId = "65077164290";
  const conflicts = [
    legacyDraftRecord({
      projectId,
      buildName: "65077164290_25650831154250_a.zip",
      webDate: "2022-08-30T17:00:00.000Z",
      stepId: "D03",
    }),
    legacyDraftRecord({
      projectId,
      buildName: "65077164290_25650831154250_b.zip",
      webDate: "2022-08-30T17:00:00.000Z",
      stepId: "D03",
    }),
  ];
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      const evidence = draftCategoryEvidenceResponse(url);
      if (evidence) return evidence;
      if (!url.pathname.endsWith("getTorZipList")) {
        return confirmedMissingDraftResponse();
      }
      return legacyDraftResponse(
        url.searchParams.get("typeId") === "03" ? conflicts : []
      );
    },
  });

  const result = await adapter.discoverDraftEbidding(projectId);

  assert.equal(result.status, "ambiguous");
  assert.equal(result.lookupMethod, LOOKUP_METHOD.DRAFT_LEGACY_PUBLIC);
  assert.equal(result.ambiguityReason, "conflicting_latest_legacy_draft");
  assert.equal(result.candidateCount, 2);
  assert.equal(result.fileId, null);
});

test("getPriceEstimateMetadata reports unavailable after all lookups", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({ response: { responseCode: "0" }, data: [] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  await assert.rejects(
    () =>
      getPriceEstimateMetadata("67079622362", {
        fetchImpl,
        projectServiceApiKey: "test-project-service-key",
      }),
    /No price estimate document found/
  );
});

test("downloadZip rejects a response that is not a ZIP", async () => {
  const fetchImpl = async () => new Response("not a zip", { status: 200 });
  await assert.rejects(() => downloadZip("abc123", { fetchImpl }), /not a valid ZIP/);
});

test("downloadLegacyZip uses the fixed official host and validated filename", async () => {
  const zip = Buffer.from("PK\u0003\u0004legacy-zip");
  let requestedUrl;
  const fetchImpl = async (url) => {
    requestedUrl = url;
    return new Response(zip, { status: 200 });
  };

  const result = await downloadLegacyZip(
    "65117172803",
    "pricebuild_310000110000034_65117172803.zip",
    { fetchImpl }
  );

  assert.equal(requestedUrl.hostname, "process3.gprocurement.go.th");
  assert.equal(
    requestedUrl.pathname,
    "/egp2procmainWeb/FPRO9965AttachServ"
  );
  assert.equal(requestedUrl.searchParams.get("projectId"), "65117172803");
  assert.deepEqual(result, zip);
});

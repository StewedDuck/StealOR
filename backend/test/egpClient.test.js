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

test("invitation discovery maps the website bidding-document ZIP fields", async () => {
  let requestedUrl;
  let requestedHeaders;
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedHeaders = options.headers;
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            projectId: "68059426756",
            zipId: "invitation-zip-id",
            buildName1: "68059426756_09062568_1.zip",
            buildName2: "announcement-template-id",
          },
        }),
        { status: 200 }
      );
    },
  });

  const result = await adapter.discoverInvitation("68059426756");

  assert.equal(
    requestedUrl.pathname,
    "/egp-approval-service/apv-common/infoProcureDocAnnounZip"
  );
  assert.equal(requestedUrl.searchParams.get("projectId"), "68059426756");
  assert.equal(requestedHeaders.noToken, "noToken");
  assert.equal(requestedHeaders.noDataProfile, "noDataProfile");
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

test("invitation discovery does not mistake the announcement template for a ZIP", async () => {
  const adapter = createNationalEgpAdapter({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            projectId: "68059426756",
            zipId: null,
            buildName1: null,
            buildName2: "announcement-template-only",
          },
        })
      ),
  });

  const result = await adapter.discoverInvitation("68059426756");

  assert.equal(result.status, "not_found");
  assert.equal(result.fileId, null);
  assert.equal(result.downloadUrl, null);
  assert.equal("announcementTemplateId" in result, false);
});

test("draft e-bidding discovery selects the only valid initial ZIP", async () => {
  const requested = [];
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
      requested.push(url);
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

  assert.equal(requested.length, 2);
  assert.equal(result.category, DOCUMENT_CATEGORY.DRAFT_EBIDDING);
  assert.equal(result.status, "available");
  assert.equal(result.lookupMethod, LOOKUP_METHOD.DRAFT_TEMP);
  assert.equal(result.fileId, "draft-initial-id");
  assert.equal(result.revision, 0);
  assert.equal(result.version, "initial");
  assert.equal(result.candidateCount, 1);
});

test("draft e-bidding discovery selects the highest explicit revision", async () => {
  const adapter = createNationalEgpAdapter({
    fetchImpl: async (url) => {
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

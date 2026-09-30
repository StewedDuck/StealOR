const test = require("node:test");
const assert = require("node:assert/strict");
const {
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
  assert.deepEqual(
    { projectId: result.projectId, fileId: result.fileId, fileName: result.fileName },
    { projectId: "69089492262", fileId: "abc123", fileName: "price.zip" }
  );
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
    fileId: "fallback-file-id",
    fileName: "pricebuild_67079622362.zip",
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
    fileId: null,
    fileName: "pricebuild_310000110000034_65117172803.zip",
    downloadMethod: "legacy_filename",
  });
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

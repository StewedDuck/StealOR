const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateProjectId,
  getPriceEstimateMetadata,
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

test("getPriceEstimateMetadata reports unavailable after both lookups", async () => {
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

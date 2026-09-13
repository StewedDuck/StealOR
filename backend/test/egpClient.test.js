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

test("downloadZip rejects a response that is not a ZIP", async () => {
  const fetchImpl = async () => new Response("not a zip", { status: 200 });
  await assert.rejects(() => downloadZip("abc123", { fetchImpl }), /not a valid ZIP/);
});

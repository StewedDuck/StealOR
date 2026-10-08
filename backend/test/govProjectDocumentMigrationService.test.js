const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildGovProjectDocumentMigrationPlan,
  planProjectMigration,
} = require("../src/services/govProjectDocumentMigrationService");

test("migration plans a targeted Price Estimate update from a stored file ID", () => {
  const rawData = { teammate: "must remain untouched" };
  const project = {
    _id: "mongo-id-1",
    project_id: "68059426756",
    raw_data: rawData,
    documentExtraction: {
      source: "egp",
      sourceDocument: "price.zip",
      sourceFileId: "stored-file-id",
      sourceSha256: "abc123",
      lastAttemptAt: "2026-10-01T00:00:00.000Z",
      extractedText: "legacy text remains in the old field",
    },
  };

  const result = planProjectMigration(project);

  assert.equal(result.outcome, "planned");
  assert.deepEqual(result.operation.updateOne.filter, { _id: "mongo-id-1" });
  assert.equal(result.operation.updateOne.upsert, false);
  assert.deepEqual(Object.keys(result.operation.updateOne.update), ["$set"]);
  assert.deepEqual(Object.keys(result.operation.updateOne.update.$set), [
    "documents.priceEstimate",
  ]);
  const metadata =
    result.operation.updateOne.update.$set["documents.priceEstimate"];
  assert.equal(metadata.fileId, "stored-file-id");
  assert.equal(metadata.fileName, "price.zip");
  assert.equal(metadata.downloadMethod, "file_id");
  assert.match(metadata.downloadUrl, /fileId=stored-file-id$/);
  assert.equal(metadata.sha256, "abc123");
  assert.equal("raw_data" in result.operation.updateOne.update.$set, false);
  assert.equal("documentExtraction" in result.operation.updateOne.update.$set, false);
  assert.equal(result.backup.documentExtraction.extractedText, project.documentExtraction.extractedText);
  assert.equal(project.raw_data, rawData);
});

test("migration preserves a valid legacy filename download reference", () => {
  const result = planProjectMigration({
    project_id: "65117172803",
    documentExtraction: {
      sourceDocument: "pricebuild_310000110000034_65117172803.zip",
      sourceFileId: null,
    },
  });

  const metadata =
    result.operation.updateOne.update.$set["documents.priceEstimate"];
  assert.equal(metadata.downloadMethod, "legacy_filename");
  assert.equal(metadata.fileId, null);
  assert.match(metadata.downloadUrl, /process3\.gprocurement\.go\.th/);
});

test("migration skips existing new metadata and unsafe legacy locators", () => {
  const plan = buildGovProjectDocumentMigrationPlan([
    {
      project_id: "68059426756",
      documents: { priceEstimate: { status: "available" } },
      documentExtraction: { sourceFileId: "old-id" },
    },
    {
      project_id: "65117172803",
      documentExtraction: {
        sourceFileId: "../../unsafe",
        sourceDocument: "../unsafe.zip",
      },
    },
    { project_id: "invalid", documentExtraction: { sourceFileId: "id" } },
  ]);

  assert.equal(plan.operations.length, 0);
  assert.deepEqual(plan.summary, {
    scanned: 3,
    planned: 0,
    skipped: 3,
    skippedByReason: {
      new_metadata_exists: 1,
      no_safe_download_reference: 1,
      invalid_project_id: 1,
    },
  });
});

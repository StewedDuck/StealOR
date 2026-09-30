const test = require("node:test");
const assert = require("node:assert/strict");
const {
  enrichAndSaveProjects,
} = require("../src/services/govProjectBatchImportService");

test("batch import saves available metadata when text extraction fails", async () => {
  let savedOperations;
  const extractionError = new Error(
    "PDF contains no extractable text; OCR is not implemented yet"
  );
  extractionError.documentMetadata = {
    source: "egp",
    sourceDocumentType: "price_estimate",
    sourceDocument: "price-estimate.zip",
    sourceFileId: "source-file-id",
    sourceSha256: "abc123",
    pdfFileNames: ["pB0.pdf"],
    textLength: 0,
  };

  const summary = await enrichAndSaveProjects(
    [{ project_id: "68059426756", project_name: "Scanned PDF project" }],
    {
      getPriceEstimateDocument: async () => {
        throw extractionError;
      },
      GovProject: {
        bulkWrite: async (operations, options) => {
          savedOperations = operations;
          assert.deepEqual(options, { ordered: false });
          return { upsertedCount: 1, modifiedCount: 0 };
        },
      },
    }
  );

  const extraction =
    savedOperations[0].updateOne.update.$set.documentExtraction;
  assert.equal(extraction.status, "failed");
  assert.equal(extraction.sourceFileId, "source-file-id");
  assert.equal(extraction.sourceDocument, "price-estimate.zip");
  assert.equal(extraction.sourceSha256, "abc123");
  assert.deepEqual(extraction.pdfFileNames, ["pB0.pdf"]);
  assert.equal(extraction.extractedText, "");
  assert.deepEqual(summary, {
    received: 1,
    unique: 1,
    succeeded: 0,
    failed: 1,
    upserted: 1,
    modified: 0,
  });
});

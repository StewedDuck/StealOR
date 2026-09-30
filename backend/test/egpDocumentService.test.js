const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractPdfTextFromZip,
  getPriceEstimateDocument,
  isSafeArchivePath,
} = require("../src/services/egp/egpDocumentService");

const ZIP_WITH_ONE_PDF = Buffer.from(
  "UEsDBBQAAAAIAPm8LF34yZN/DwAAAA0AAAAHAAAAdG9yLnBkZlMNcHHTNdQzUUhLzE4FAFBLAQIUABQAAAAIAPm8LF34yZN/DwAAAA0AAAAHAAAAAAAAAAAAAAAAAAAAAAB0b3IucGRmUEsFBgAAAAABAAEANQAAADQAAAAAAA==",
  "base64"
);
const ZIP_WITH_FAKE_PDF = Buffer.from(
  "UEsDBBQAAAAIADxvLV0kLzrCEgAAABAAAAAIAAAAZmFrZS5wZGbLyy9RKEpNzMmpVEhUKEhJAwBQSwECFAAUAAAACAA8by1dJC86whIAAAAQAAAACAAAAAAAAAAAAAAAAAAAAAAAZmFrZS5wZGZQSwUGAAAAAAEAAQA2AAAAOAAAAAAA",
  "base64"
);

test("archive paths reject traversal", () => {
  assert.equal(isSafeArchivePath("documents/tor.pdf"), true);
  assert.equal(isSafeArchivePath("../tor.pdf"), false);
  assert.equal(isSafeArchivePath("documents\\..\\tor.pdf"), false);
});

test("extractPdfTextFromZip returns PDF names and normalized text", async () => {
  const parsePdf = async () => ({
    text: "This is enough extracted TOR text to continue to structured extraction.",
  });
  const result = await extractPdfTextFromZip(ZIP_WITH_ONE_PDF, { parsePdf });

  assert.deepEqual(result.pdfFileNames, ["tor.pdf"]);
  assert.match(result.extractedText, /extracted TOR text/);
  assert.equal(result.textLength, result.extractedText.length);
});

test("extractPdfTextFromZip rejects a fake PDF extension", async () => {
  await assert.rejects(
    () => extractPdfTextFromZip(ZIP_WITH_FAKE_PDF),
    /valid PDF signature/
  );
});

test("getPriceEstimateDocument preserves metadata when a PDF needs OCR", async () => {
  let requestCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response(
        JSON.stringify({
          response: { responseCode: "0" },
          data: {
            zipFileId: "source-file-id",
            zipFileName: "price-estimate.zip",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(ZIP_WITH_ONE_PDF, {
      status: 200,
      headers: { "content-type": "application/zip" },
    });
  };

  await assert.rejects(
    () =>
      getPriceEstimateDocument("67039549408", {
        fetchImpl,
        parsePdf: async () => ({ text: "" }),
      }),
    (error) => {
      assert.match(error.message, /OCR is not implemented/);
      assert.equal(error.documentMetadata.sourceFileId, "source-file-id");
      assert.equal(
        error.documentMetadata.sourceDocument,
        "price-estimate.zip"
      );
      assert.deepEqual(error.documentMetadata.pdfFileNames, ["tor.pdf"]);
      assert.match(error.documentMetadata.sourceSha256, /^[a-f0-9]{64}$/);
      return true;
    }
  );
});

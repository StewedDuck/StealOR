const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractPdfTextFromZip,
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

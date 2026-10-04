// Tests reference planning and secure ZIP-to-PDF staging. Fixtures
// remain local and exercise path, signature, size, and cleanup protections.
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isSafePhaseBArchivePath,
  planDocumentExtractionBatch,
  planProjectDocumentExtraction,
  stagePdfArchive,
} = require("../src/services/govProjectDocumentExtractionService");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const content = Buffer.from(file.content);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function withTemporaryDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "stealor-phase-b-"));
  try {
    return await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function fileIdReference(fileId, fileName) {
  return {
    status: "available",
    downloadMethod: "file_id",
    fileId,
    fileName,
  };
}

test("planner independently selects every usable document category", () => {
  const result = planProjectDocumentExtraction({
    project_id: "68059426756",
    documents: {
      priceEstimate: fileIdReference("price-id", "price.zip"),
      invitation: fileIdReference("invitation-id", "invitation.zip"),
      draftEbidding: {
        status: "available",
        downloadMethod: "legacy_draft_transfer",
        fileName: "68059426756_25681004000000_2.zip",
        legacyItemNo: 2,
        legacyTypeId: "04",
        legacyDocType: "adj",
        legacyMethodId: "16",
      },
      selectedProcurementDocument: "invitation",
    },
  });

  assert.equal(result.summary.usable, 3);
  assert.equal(result.categories.priceEstimate.outcome, "would_download");
  assert.equal(result.categories.invitation.outcome, "would_download");
  assert.equal(result.categories.draftEbidding.outcome, "would_download");
  for (const category of Object.values(result.categories)) {
    assert.match(category.locatorIdentity, /^sha256:[a-f0-9]{64}$/);
  }
});

test("available status without the category locator is skipped", () => {
  const result = planProjectDocumentExtraction({
    project_id: "68059426756",
    documents: {
      priceEstimate: { status: "available" },
      invitation: {
        status: "available",
        downloadMethod: "legacy_filename",
        fileName: "pricebuild_310000110000034_68059426756.zip",
      },
      draftEbidding: { status: "ambiguous", fileId: "draft-id" },
      selectedProcurementDocument: "draftEbidding",
    },
  });

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(result.categories).map(([key, value]) => [
        key,
        [value.outcome, value.reason],
      ])
    ),
    {
      priceEstimate: ["skipped", "missing_or_invalid_locator"],
      invitation: ["skipped", "missing_or_invalid_locator"],
      draftEbidding: ["skipped", "status_ambiguous"],
    }
  );
});

test("batch planning isolates an invalid project from later projects", () => {
  const result = planDocumentExtractionBatch([
    { project_id: "invalid", documents: {} },
    {
      project_id: "68059426756",
      documents: {
        invitation: fileIdReference("invitation-id", "invitation.zip"),
      },
    },
  ]);

  assert.equal(result.summary.projects, 2);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.summary.planned, 1);
  assert.equal(result.summary.usableCategories, 1);
  assert.equal(result.reports[0].outcome, "failed");
  assert.equal(result.reports[1].projectId, "68059426756");
});

test("Phase B archive paths reject traversal, absolute, drive, and control paths", () => {
  assert.equal(isSafePhaseBArchivePath("nested/เอกสาร.pdf"), true);
  assert.equal(isSafePhaseBArchivePath("../document.pdf"), false);
  assert.equal(isSafePhaseBArchivePath("nested\\..\\document.pdf"), false);
  assert.equal(isSafePhaseBArchivePath("/absolute/document.pdf"), false);
  assert.equal(isSafePhaseBArchivePath("C:\\absolute\\document.pdf"), false);
  assert.equal(isSafePhaseBArchivePath("C:drive-relative.pdf"), false);
  assert.equal(isSafePhaseBArchivePath("nested//document.pdf"), false);
  assert.equal(isSafePhaseBArchivePath("nested/evil\u0000.pdf"), false);
});

test("stages multiple nested PDFs and avoids case-insensitive overwrites", async () => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const stagingDirectory = path.join(temporaryDirectory, "stage");
    const firstPdf = Buffer.from("%PDF-1.7\nfirst\n%%EOF");
    const secondPdf = Buffer.from("%PDF-1.7\nsecond\n%%EOF");
    const zip = createStoredZip([
      { name: "nested/Report.pdf", content: firstPdf },
      { name: "nested/report.PDF", content: secondPdf },
      { name: "notes.txt", content: "ignored" },
    ]);

    const result = await stagePdfArchive(zip, { stagingDirectory });

    assert.equal(result.pdfs.length, 2);
    assert.deepEqual(
      result.pdfs.map((pdf) => pdf.artifactRelativePath),
      ["files/nested/Report.pdf", "files/nested/report__2.PDF"]
    );
    assert.equal(
      result.pdfs[0].sha256,
      crypto.createHash("sha256").update(firstPdf).digest("hex")
    );
    assert.deepEqual(
      await fs.readFile(path.join(stagingDirectory, "files/nested/Report.pdf")),
      firstPdf
    );
    assert.deepEqual(
      await fs.readFile(
        path.join(stagingDirectory, "files/nested/report__2.PDF")
      ),
      secondPdf
    );
  });
});

test("rejects unsafe entries even when the unsafe entry is not a PDF", async () => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const stagingDirectory = path.join(temporaryDirectory, "stage");
    const zip = createStoredZip([
      { name: "safe.pdf", content: "%PDF-1.7\nvalid" },
      { name: "../outside.txt", content: "unsafe" },
    ]);

    await assert.rejects(
      () => stagePdfArchive(zip, { stagingDirectory }),
      (error) => error.code === "unsafe_archive_path"
    );
    await assert.rejects(() => fs.lstat(stagingDirectory), { code: "ENOENT" });
    await assert.rejects(() => fs.lstat(path.join(temporaryDirectory, "outside.txt")), {
      code: "ENOENT",
    });
  });
});

test("invalid PDF signature fails the archive and cleans all staged files", async () => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const stagingDirectory = path.join(temporaryDirectory, "stage");
    const zip = createStoredZip([
      { name: "valid.pdf", content: "%PDF-1.7\nvalid" },
      { name: "invalid.pdf", content: "not a pdf" },
    ]);

    await assert.rejects(
      () => stagePdfArchive(zip, { stagingDirectory }),
      (error) => error.code === "invalid_pdf_signature"
    );
    await assert.rejects(() => fs.lstat(stagingDirectory), { code: "ENOENT" });
  });
});

test("no-PDF and corrupt archives fail without leaving staging directories", async () => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const noPdfStage = path.join(temporaryDirectory, "no-pdf");
    const corruptStage = path.join(temporaryDirectory, "corrupt");

    await assert.rejects(
      () =>
        stagePdfArchive(
          createStoredZip([{ name: "readme.txt", content: "hello" }]),
          { stagingDirectory: noPdfStage }
        ),
      (error) => error.code === "no_pdf_entries"
    );
    await assert.rejects(
      () => stagePdfArchive(Buffer.from("not a zip"), { stagingDirectory: corruptStage }),
      (error) => error.code === "invalid_zip"
    );
    await assert.rejects(() => fs.lstat(noPdfStage), { code: "ENOENT" });
    await assert.rejects(() => fs.lstat(corruptStage), { code: "ENOENT" });
  });
});

test("rejects archives over the PDF count limit and cleans staging", async () => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const stagingDirectory = path.join(temporaryDirectory, "stage");
    const zip = createStoredZip(
      Array.from({ length: 21 }, (_, index) => ({
        name: `document-${index + 1}.pdf`,
        content: "%PDF-1.7",
      }))
    );

    await assert.rejects(
      () => stagePdfArchive(zip, { stagingDirectory }),
      (error) => error.code === "too_many_pdf_entries"
    );
    await assert.rejects(() => fs.lstat(stagingDirectory), { code: "ENOENT" });
  });
});

test("refuses to reuse an existing staging directory", async () => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const stagingDirectory = path.join(temporaryDirectory, "stage");
    await fs.mkdir(stagingDirectory);
    await fs.writeFile(path.join(stagingDirectory, "owned.txt"), "preserve");

    await assert.rejects(
      () =>
        stagePdfArchive(
          createStoredZip([{ name: "document.pdf", content: "%PDF-1.7" }]),
          { stagingDirectory }
        ),
      (error) => error.code === "staging_path_exists"
    );
    assert.equal(
      await fs.readFile(path.join(stagingDirectory, "owned.txt"), "utf8"),
      "preserve"
    );
  });
});

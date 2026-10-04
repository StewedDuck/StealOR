// Tests the complete category pipeline with mocked e-GP downloads,
// including legacy locators, stale metadata, ZIP retention, cleanup, and
// continuation after individual failures. No live services are contacted.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  processDocumentCategory,
  processProjectDocumentExtractions,
  verifyPublishedDocumentCategory,
} = require("../src/services/govProjectDocumentExtractionService");

const PROJECT_ID = "68059426756";
const ZIP_WITH_ONE_PDF = Buffer.from(
  "UEsDBBQAAAAIAPm8LF34yZN/DwAAAA0AAAAHAAAAdG9yLnBkZlMNcHHTNdQzUUhLzE4FAFBLAQIUABQAAAAIAPm8LF34yZN/DwAAAA0AAAAHAAAAAAAAAAAAAAAAAAAAAAB0b3IucGRmUEsFBgAAAAABAAEANQAAADQAAAAAAA==",
  "base64"
);
const ZIP_WITH_INVALID_PDF = Buffer.from(
  "UEsDBBQAAAAIADxvLV0kLzrCEgAAABAAAAAIAAAAZmFrZS5wZGbLyy9RKEpNzMmpVEhUKEhJAwBQSwECFAAUAAAACAA8by1dJC86whIAAAAQAAAACAAAAAAAAAAAAAAAAAAAAAAAZmFrZS5wZGZQSwUGAAAAAAEAAQA2AAAAOAAAAAAA",
  "base64"
);

function modernReference(fileId = "invitation-id", fileName = "invitation.zip") {
  return {
    status: "available",
    downloadMethod: "file_id",
    fileId,
    fileName,
  };
}

async function withTemporaryDirectory(callback) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "stealor-phase-b-pipeline-")
  );
  try {
    return await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("modern download publishes PDFs and deletes successful ZIP data", async () => {
  await withTemporaryDirectory(async (tempRoot) => {
    const calls = [];
    const zipDirectory = path.join(tempRoot, "zips", PROJECT_ID);
    await fs.mkdir(zipDirectory, { recursive: true });
    await fs.writeFile(
      path.join(zipDirectory, "invitation.zip.part-interrupted"),
      "partial"
    );

    const result = await processDocumentCategory(
      {
        projectId: PROJECT_ID,
        category: "invitation",
        reference: modernReference(),
        tempRoot,
      },
      {
        egpAdapter: {
          async downloadDocument(metadata) {
            calls.push(metadata);
            return ZIP_WITH_ONE_PDF;
          },
          shouldRediscoverAfterDownloadError() {
            return false;
          },
        },
        runId: () => "modern-run",
        randomId: () => "modern-temp",
        now: () => new Date("2026-10-04T00:00:00.000Z"),
      }
    );

    assert.equal(result.outcome, "extracted");
    assert.equal(result.zipDeleted, true);
    assert.equal(result.pdfCount, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].projectId, PROJECT_ID);
    assert.equal(calls[0].fileId, "invitation-id");
    await assert.rejects(
      () => fs.lstat(path.join(zipDirectory, "invitation.zip")),
      { code: "ENOENT" }
    );
    await assert.rejects(
      () => fs.lstat(path.join(zipDirectory, "invitation.zip.source.json")),
      { code: "ENOENT" }
    );
    assert.equal(
      (await fs.readdir(zipDirectory)).some((name) => name.includes(".part-")),
      false
    );
    assert.equal(
      (
        await verifyPublishedDocumentCategory({
          categoryDirectory: path.join(
            tempRoot,
            "pdfs",
            PROJECT_ID,
            "invitation"
          ),
          locatorIdentity: result.locatorIdentity,
        })
      ).verified,
      true
    );
  });
});

test("legacy Price Estimate and Draft references are passed unchanged to the adapter", async () => {
  const cases = [
    {
      category: "priceEstimate",
      reference: {
        status: "available",
        downloadMethod: "legacy_filename",
        fileName: `pricebuild_310000110000034_${PROJECT_ID}.zip`,
      },
    },
    {
      category: "draftEbidding",
      reference: {
        status: "available",
        downloadMethod: "legacy_draft_transfer",
        fileName: `${PROJECT_ID}_25681004000000_2.zip`,
        legacyItemNo: 3,
        legacyTypeId: "04",
        legacyDocType: "adj",
        legacyMethodId: "16",
      },
    },
  ];

  for (const item of cases) {
    await withTemporaryDirectory(async (tempRoot) => {
      let downloadedMetadata;
      const result = await processDocumentCategory(
        {
          projectId: PROJECT_ID,
          category: item.category,
          reference: item.reference,
          tempRoot,
        },
        {
          egpAdapter: {
            async downloadDocument(metadata) {
              downloadedMetadata = metadata;
              return ZIP_WITH_ONE_PDF;
            },
            shouldRediscoverAfterDownloadError() {
              return false;
            },
          },
        }
      );

      assert.equal(result.outcome, "extracted");
      assert.equal(downloadedMetadata.downloadMethod, item.reference.downloadMethod);
      assert.equal(downloadedMetadata.fileName, item.reference.fileName);
      if (item.category === "draftEbidding") {
        assert.equal(downloadedMetadata.legacyItemNo, 3);
        assert.equal(downloadedMetadata.legacyTypeId, "04");
        assert.equal(downloadedMetadata.legacyDocType, "adj");
      }
    });
  }
});

test("stale download references report metadata_refresh_required without discovery", async () => {
  await withTemporaryDirectory(async (tempRoot) => {
    let downloadCount = 0;
    const staleError = Object.assign(new Error("stored file ID is gone"), {
      code: "EGP_INVALID_FILE_ID",
    });
    const result = await processDocumentCategory(
      {
        projectId: PROJECT_ID,
        category: "invitation",
        reference: modernReference(),
        tempRoot,
      },
      {
        egpAdapter: {
          async downloadDocument() {
            downloadCount += 1;
            throw staleError;
          },
          shouldRediscoverAfterDownloadError(error) {
            return error === staleError;
          },
          discoverInvitation() {
            throw new Error("Phase B must not perform discovery");
          },
        },
      }
    );

    assert.equal(downloadCount, 1);
    assert.equal(result.outcome, "failed");
    assert.equal(result.error.code, "metadata_refresh_required");
    assert.equal(result.error.metadataRefreshRequired, true);
    assert.equal(result.zipRetained, false);
  });
});

test("failed PDF validation retains the ZIP and removes failed staging", async () => {
  await withTemporaryDirectory(async (tempRoot) => {
    const result = await processDocumentCategory(
      {
        projectId: PROJECT_ID,
        category: "invitation",
        reference: modernReference(),
        tempRoot,
      },
      {
        egpAdapter: {
          async downloadDocument() {
            return ZIP_WITH_INVALID_PDF;
          },
          shouldRediscoverAfterDownloadError() {
            return false;
          },
        },
        runId: () => "failed-run",
      }
    );

    assert.equal(result.outcome, "failed");
    assert.equal(result.error.code, "invalid_pdf_signature");
    assert.equal(result.zipRetained, true);
    assert.deepEqual(await fs.readFile(result.retainedZipPath), ZIP_WITH_INVALID_PDF);
    await assert.rejects(
      () =>
        fs.lstat(
          path.join(
            tempRoot,
            "pdfs",
            ".staging",
            "failed-run",
            PROJECT_ID,
            "invitation"
          )
        ),
      { code: "ENOENT" }
    );
  });
});

test("a retained ZIP is safely reused after a failed publication", async () => {
  await withTemporaryDirectory(async (tempRoot) => {
    let downloadCount = 0;
    const adapter = {
      async downloadDocument() {
        downloadCount += 1;
        return ZIP_WITH_ONE_PDF;
      },
      shouldRediscoverAfterDownloadError() {
        return false;
      },
    };
    const input = {
      projectId: PROJECT_ID,
      category: "invitation",
      reference: modernReference(),
      tempRoot,
    };
    const first = await processDocumentCategory(input, {
      egpAdapter: adapter,
      runId: () => "first-run",
      publishStagedDocumentCategory: async () => {
        const error = new Error("injected publication failure");
        error.code = "injected_publish_failure";
        error.stage = "publish";
        throw error;
      },
    });
    assert.equal(first.outcome, "failed");
    assert.equal(first.zipRetained, true);

    const second = await processDocumentCategory(input, {
      egpAdapter: adapter,
      runId: () => "second-run",
    });
    assert.equal(second.outcome, "extracted");
    assert.equal(second.reusedTemporaryZip, true);
    assert.equal(downloadCount, 1);
  });
});

test("verified reruns skip downloading while checking leftover ZIP cleanup", async () => {
  await withTemporaryDirectory(async (tempRoot) => {
    let downloadCount = 0;
    const adapter = {
      async downloadDocument() {
        downloadCount += 1;
        return ZIP_WITH_ONE_PDF;
      },
      shouldRediscoverAfterDownloadError() {
        return false;
      },
    };
    const input = {
      projectId: PROJECT_ID,
      category: "invitation",
      reference: modernReference(),
      tempRoot,
    };
    assert.equal(
      (await processDocumentCategory(input, { egpAdapter: adapter })).outcome,
      "extracted"
    );
    const rerun = await processDocumentCategory(input, { egpAdapter: adapter });

    assert.equal(rerun.outcome, "skipped_verified");
    assert.equal(downloadCount, 1);
  });
});

test("one category failure does not prevent later project categories", async () => {
  await withTemporaryDirectory(async (tempRoot) => {
    const result = await processProjectDocumentExtractions(
      {
        project_id: PROJECT_ID,
        documents: {
          priceEstimate: modernReference("price-id", "price.zip"),
          invitation: modernReference("invitation-id", "invitation.zip"),
          draftEbidding: { status: "not_found" },
          selectedProcurementDocument: "invitation",
        },
      },
      { tempRoot },
      {
        egpAdapter: {
          async downloadDocument(metadata) {
            if (metadata.fileId === "price-id") {
              throw new Error("injected price failure");
            }
            return ZIP_WITH_ONE_PDF;
          },
          shouldRediscoverAfterDownloadError() {
            return false;
          },
        },
      }
    );

    assert.equal(result.summary.failed, 1);
    assert.equal(result.summary.extracted, 1);
    assert.equal(result.summary.skipped, 1);
    assert.equal(result.categories[0].category, "priceEstimate");
    assert.equal(result.categories[0].outcome, "failed");
    assert.equal(result.categories[1].category, "invitation");
    assert.equal(result.categories[1].outcome, "extracted");
    assert.equal(result.categories[2].category, "draftEbidding");
    assert.equal(result.categories[2].outcome, "skipped");
  });
});

test("temporary ZIP deletion failure is a warning after successful publication", async () => {
  await withTemporaryDirectory(async (tempRoot) => {
    const result = await processDocumentCategory(
      {
        projectId: PROJECT_ID,
        category: "invitation",
        reference: modernReference(),
        tempRoot,
      },
      {
        egpAdapter: {
          async downloadDocument() {
            return ZIP_WITH_ONE_PDF;
          },
          shouldRediscoverAfterDownloadError() {
            return false;
          },
        },
        deleteTemporaryZip: async () => ({
          deleted: false,
          warnings: [
            {
              code: "temporary_zip_cleanup_failed",
              message: "injected cleanup failure",
              path: "invitation.zip",
            },
          ],
        }),
      }
    );

    assert.equal(result.outcome, "extracted");
    assert.equal(result.zipDeleted, false);
    assert.equal(result.cleanupWarnings.length, 1);
    assert.equal(
      result.cleanupWarnings[0].code,
      "temporary_zip_cleanup_failed"
    );
  });
});

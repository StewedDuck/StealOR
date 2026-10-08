// Tests manifest verification and safe artifact publication, including
// replacement rollback and preservation of previously successful PDFs.
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  publishStagedDocumentCategory,
  verifyPublishedDocumentCategory,
} = require("../src/services/govProjectDocumentExtractionService");
const {
  verifyCategoryArtifacts,
} = require("../src/services/govProjectDocumentExtraction/manifestStore");

const PROJECT_ID = "68059426756";
const CATEGORY = "invitation";
const LOCATOR_A = `sha256:${"a".repeat(64)}`;
const LOCATOR_B = `sha256:${"b".repeat(64)}`;
const ZIP_SHA256 = "c".repeat(64);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function withTemporaryDirectory(callback) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "stealor-phase-b-publish-")
  );
  try {
    return await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function createStagedExtraction(root, name, content, options = {}) {
  const stagingDirectory = path.join(root, name);
  const artifactRelativePath = options.artifactRelativePath || "files/document.pdf";
  const artifactPath = path.join(
    stagingDirectory,
    ...artifactRelativePath.split("/")
  );
  const buffer = Buffer.from(content);
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, buffer);
  return {
    stagingDirectory,
    pdfs: [
      {
        originalFileName: "document.pdf",
        originalEntryPath: "source/document.pdf",
        artifactRelativePath,
        sizeBytes: buffer.length,
        sha256: options.sha256 || sha256(buffer),
        status: "staged",
      },
    ],
    totalPdfBytes: buffer.length,
  };
}

function publicationInput(stagedExtraction, categoryDirectory, overrides = {}) {
  return {
    projectId: PROJECT_ID,
    category: CATEGORY,
    sourceZipFileName: "invitation.zip",
    locatorIdentity: LOCATOR_A,
    downloadMethod: "file_id",
    zipSha256: ZIP_SHA256,
    zipSizeBytes: 1234,
    processedAt: new Date("2026-10-04T00:00:00.000Z"),
    stagedExtraction,
    categoryDirectory,
    ...overrides,
  };
}

test("publishes staged PDFs with a traceable manifest and verifies reruns", async () => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const staging = await createStagedExtraction(
      temporaryDirectory,
      "stage",
      "%PDF-1.7\nverified\n%%EOF"
    );
    const categoryDirectory = path.join(
      temporaryDirectory,
      "pdfs",
      PROJECT_ID,
      CATEGORY
    );

    const published = await publishStagedDocumentCategory(
      publicationInput(staging, categoryDirectory)
    );

    assert.equal(published.status, "published");
    assert.equal(published.replacedExisting, false);
    assert.equal(published.manifest.schemaVersion, 1);
    assert.equal(published.manifest.status, "verified");
    assert.equal(published.manifest.source.locatorIdentity, LOCATOR_A);
    assert.equal(published.manifest.zip.sha256, ZIP_SHA256);
    assert.equal(
      published.manifest.pdfs[0].localArtifactPath,
      `pdfs/${PROJECT_ID}/${CATEGORY}/files/document.pdf`
    );
    assert.equal(published.manifest.error, null);
    assert.deepEqual(
      await fs.readFile(path.join(categoryDirectory, "files/document.pdf")),
      Buffer.from("%PDF-1.7\nverified\n%%EOF")
    );
    await assert.rejects(() => fs.lstat(staging.stagingDirectory), {
      code: "ENOENT",
    });

    const verification = await verifyPublishedDocumentCategory({
      categoryDirectory,
      locatorIdentity: LOCATOR_A,
    });
    assert.equal(verification.verified, true);

    const mismatch = await verifyPublishedDocumentCategory({
      categoryDirectory,
      locatorIdentity: LOCATOR_B,
    });
    assert.equal(mismatch.verified, false);
    assert.equal(mismatch.reason, "locator_mismatch");
  });
});

test("detects a retained PDF that changed after publication", async () => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const staging = await createStagedExtraction(
      temporaryDirectory,
      "stage",
      "%PDF-1.7\noriginal"
    );
    const categoryDirectory = path.join(temporaryDirectory, "final");
    await publishStagedDocumentCategory(
      publicationInput(staging, categoryDirectory)
    );
    await fs.writeFile(
      path.join(categoryDirectory, "files/document.pdf"),
      "%PDF-1.7\nmodified"
    );

    const verification = await verifyPublishedDocumentCategory({
      categoryDirectory,
      locatorIdentity: LOCATOR_A,
    });
    assert.equal(verification.verified, false);
    assert.match(verification.reason, /^artifact_(size|hash)_mismatch$/);
  });
});

test("a failed staged verification preserves previous successful artifacts", async () => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const categoryDirectory = path.join(temporaryDirectory, "final");
    const first = await createStagedExtraction(
      temporaryDirectory,
      "first-stage",
      "%PDF-1.7\nfirst"
    );
    await publishStagedDocumentCategory(
      publicationInput(first, categoryDirectory)
    );

    const invalid = await createStagedExtraction(
      temporaryDirectory,
      "invalid-stage",
      "%PDF-1.7\nsecond",
      { sha256: "0".repeat(64) }
    );
    await assert.rejects(
      () =>
        publishStagedDocumentCategory(
          publicationInput(invalid, categoryDirectory, {
            locatorIdentity: LOCATOR_B,
          })
        ),
      (error) => error.code === "staged_artifact_verification_failed"
    );

    assert.deepEqual(
      await fs.readFile(path.join(categoryDirectory, "files/document.pdf")),
      Buffer.from("%PDF-1.7\nfirst")
    );
    assert.equal(
      (
        await verifyPublishedDocumentCategory({
          categoryDirectory,
          locatorIdentity: LOCATOR_A,
        })
      ).verified,
      true
    );
    await assert.rejects(() => fs.lstat(invalid.stagingDirectory), {
      code: "ENOENT",
    });
  });
});

test("post-publish verification failure rolls back the previous category", async () => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const categoryDirectory = path.join(temporaryDirectory, "final");
    const first = await createStagedExtraction(
      temporaryDirectory,
      "first-stage",
      "%PDF-1.7\nfirst"
    );
    await publishStagedDocumentCategory(
      publicationInput(first, categoryDirectory)
    );
    const replacement = await createStagedExtraction(
      temporaryDirectory,
      "replacement-stage",
      "%PDF-1.7\nreplacement"
    );

    await assert.rejects(
      () =>
        publishStagedDocumentCategory(
          publicationInput(replacement, categoryDirectory, {
            locatorIdentity: LOCATOR_B,
          }),
          {
            verifyCategoryArtifacts: async (options, dependencies) => {
              if (
                path.resolve(options.categoryDirectory) ===
                path.resolve(categoryDirectory)
              ) {
                return { verified: false, reason: "injected_failure" };
              }
              return verifyCategoryArtifacts(options, dependencies);
            },
          }
        ),
      (error) => error.code === "published_artifact_verification_failed"
    );

    assert.deepEqual(
      await fs.readFile(path.join(categoryDirectory, "files/document.pdf")),
      Buffer.from("%PDF-1.7\nfirst")
    );
    assert.equal(
      (
        await verifyPublishedDocumentCategory({
          categoryDirectory,
          locatorIdentity: LOCATOR_A,
        })
      ).verified,
      true
    );
  });
});

test("successful replacement removes old artifacts and temporary backups", async () => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const categoryDirectory = path.join(temporaryDirectory, "final");
    const first = await createStagedExtraction(
      temporaryDirectory,
      "first-stage",
      "%PDF-1.7\nfirst",
      { artifactRelativePath: "files/old.pdf" }
    );
    await publishStagedDocumentCategory(
      publicationInput(first, categoryDirectory)
    );
    const replacement = await createStagedExtraction(
      temporaryDirectory,
      "replacement-stage",
      "%PDF-1.7\nreplacement",
      { artifactRelativePath: "files/new.pdf" }
    );

    const result = await publishStagedDocumentCategory(
      publicationInput(replacement, categoryDirectory, {
        locatorIdentity: LOCATOR_B,
      })
    );

    assert.equal(result.replacedExisting, true);
    assert.equal(result.cleanupWarnings.length, 0);
    assert.deepEqual(
      await fs.readFile(path.join(categoryDirectory, "files/new.pdf")),
      Buffer.from("%PDF-1.7\nreplacement")
    );
    await assert.rejects(
      () => fs.lstat(path.join(categoryDirectory, "files/old.pdf")),
      { code: "ENOENT" }
    );
    const siblings = await fs.readdir(temporaryDirectory);
    assert.equal(siblings.some((name) => name.includes(".final.backup-")), false);
  });
});

test("manifest verification rejects artifact paths outside the category", async () => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const categoryDirectory = path.join(temporaryDirectory, "final");
    await fs.mkdir(categoryDirectory, { recursive: true });
    await fs.writeFile(path.join(temporaryDirectory, "outside.pdf"), "%PDF-1.7");
    await fs.writeFile(
      path.join(categoryDirectory, "manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        status: "verified",
        source: { locatorIdentity: LOCATOR_A },
        pdfs: [
          {
            artifactRelativePath: "../outside.pdf",
            sizeBytes: 8,
            sha256: sha256(Buffer.from("%PDF-1.7")),
          },
        ],
      })
    );

    const result = await verifyPublishedDocumentCategory({
      categoryDirectory,
      locatorIdentity: LOCATOR_A,
    });
    assert.equal(result.verified, false);
    assert.equal(result.reason, "unsafe_or_duplicate_artifact_path");
    assert.equal(
      await fs.readFile(path.join(temporaryDirectory, "outside.pdf"), "utf8"),
      "%PDF-1.7"
    );
  });
});

// Public orchestration service and compatibility facade. It processes
// stored document references without metadata rediscovery, coordinates local
// ZIP/PDF artifacts, and deliberately performs no OCR or PDF text extraction.
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  nationalEgpAdapter,
  validateProjectId,
} = require("./egp/egpClient");
const {
  DOCUMENT_KEYS,
  canonicalLocatorIdentity,
  isUsableDocumentReference,
} = require("./egp/documentReferencePolicy");
const {
  GovProjectDocumentExtractionError,
} = require("./govProjectDocumentExtraction/errors");
const {
  MAX_ARCHIVE_ENTRIES,
  MAX_PDF_COUNT,
  MAX_TOTAL_PDF_BYTES,
  isSafePhaseBArchivePath,
  stagePdfArchive,
} = require("./govProjectDocumentExtraction/archiveStaging");
const {
  MANIFEST_FILE_NAME,
  MANIFEST_SCHEMA_VERSION,
  buildExtractionManifest,
  verifyCategoryArtifacts,
} = require("./govProjectDocumentExtraction/manifestStore");
const {
  publishStagedCategory,
} = require("./govProjectDocumentExtraction/artifactStore");
const { extractionError } = require("./govProjectDocumentExtraction/errors");
const {
  deleteTemporaryZip,
  readReusableTemporaryZip,
  storeDownloadedZip,
  temporaryZipPaths,
} = require("./govProjectDocumentExtraction/temporaryZipStore");

function asPlainObject(value) {
  if (!value || typeof value !== "object") return {};
  return typeof value.toObject === "function"
    ? value.toObject({ depopulate: true })
    : value;
}

function unusableReferenceReason(reference) {
  const status = String(reference.status || "not_checked");
  if (status !== "available") return `status_${status}`;
  return "missing_or_invalid_locator";
}

function planProjectDocumentExtraction(projectInput) {
  const project = asPlainObject(projectInput);
  const projectId = validateProjectId(String(project.project_id || "").trim());
  const documents = asPlainObject(project.documents);
  const categories = {};
  let usable = 0;
  let skipped = 0;

  for (const category of DOCUMENT_KEYS) {
    const reference = asPlainObject(documents[category]);
    const isUsable = isUsableDocumentReference(
      category,
      reference,
      projectId
    );
    const locatorIdentity = isUsable
      ? canonicalLocatorIdentity(projectId, category, reference)
      : null;

    if (isUsable) usable += 1;
    else skipped += 1;

    categories[category] = {
      outcome: isUsable ? "would_download" : "skipped",
      reason: isUsable ? null : unusableReferenceReason(reference),
      status: reference.status || "not_checked",
      downloadMethod: isUsable ? reference.downloadMethod || "file_id" : null,
      sourceZipFileName: isUsable ? reference.fileName || null : null,
      locatorIdentity,
    };
  }

  return {
    projectId,
    categories,
    summary: {
      categories: DOCUMENT_KEYS.length,
      usable,
      skipped,
    },
  };
}

function planDocumentExtractionBatch(projects) {
  if (!Array.isArray(projects)) throw new TypeError("projects must be an array");

  const reports = [];
  const summary = {
    projects: projects.length,
    planned: 0,
    failed: 0,
    usableCategories: 0,
    skippedCategories: 0,
  };

  for (const project of projects) {
    try {
      const report = planProjectDocumentExtraction(project);
      reports.push(report);
      summary.planned += 1;
      summary.usableCategories += report.summary.usable;
      summary.skippedCategories += report.summary.skipped;
    } catch (error) {
      summary.failed += 1;
      reports.push({
        projectId: String(project?.project_id || "").trim() || null,
        outcome: "failed",
        error: {
          code: error?.code || "INVALID_PROJECT",
          message: String(error?.message || "Unable to plan extraction").slice(
            0,
            500
          ),
        },
      });
    }
  }

  return { reports, summary };
}

async function publishStagedDocumentCategory(input, dependencies = {}) {
  const stagedExtraction = input?.stagedExtraction;
  if (!stagedExtraction?.stagingDirectory || !Array.isArray(stagedExtraction.pdfs)) {
    throw new TypeError("stagedExtraction with stagingDirectory and pdfs is required");
  }
  const manifest = buildExtractionManifest({
    projectId: input.projectId,
    category: input.category,
    sourceZipFileName: input.sourceZipFileName,
    locatorIdentity: input.locatorIdentity,
    downloadMethod: input.downloadMethod,
    zipSha256: input.zipSha256,
    zipSizeBytes: input.zipSizeBytes,
    pdfs: stagedExtraction.pdfs,
    processedAt: input.processedAt,
  });
  const publication = await publishStagedCategory(
    {
      stagingDirectory: stagedExtraction.stagingDirectory,
      categoryDirectory: input.categoryDirectory,
      manifest,
    },
    dependencies
  );
  return { ...publication, manifest };
}

function verifyPublishedDocumentCategory(input, dependencies = {}) {
  return verifyCategoryArtifacts(
    {
      categoryDirectory: input?.categoryDirectory,
      expectedLocatorIdentity: input?.locatorIdentity,
    },
    dependencies
  );
}

function extractionPaths(tempRoot, projectId, category, runId) {
  return {
    categoryDirectory: path.join(
      tempRoot,
      "pdfs",
      projectId,
      category
    ),
    stagingDirectory: path.join(
      tempRoot,
      "pdfs",
      ".staging",
      runId,
      projectId,
      category
    ),
  };
}

async function pruneRunOwnedStagingParents(
  stagingDirectory,
  stagingRoot,
  fileSystem
) {
  const resolvedStagingDirectory = path.resolve(stagingDirectory);
  const resolvedStagingRoot = path.resolve(stagingRoot);
  const relativePath = path.relative(
    resolvedStagingRoot,
    resolvedStagingDirectory
  );
  const segments = relativePath.split(path.sep);
  if (
    segments.length !== 3 ||
    segments.some((segment) => !segment || segment === "..")
  ) {
    return [
      {
        code: "staging_parent_cleanup_refused",
        message: "Refusing to prune a staging path outside the owned run layout",
        path: resolvedStagingDirectory,
      },
    ];
  }

  const warnings = [];
  const projectDirectory = path.dirname(resolvedStagingDirectory);
  const runDirectory = path.dirname(projectDirectory);
  for (const targetPath of [projectDirectory, runDirectory]) {
    try {
      await fileSystem.rmdir(targetPath);
    } catch (error) {
      if (!["ENOENT", "ENOTEMPTY"].includes(error?.code)) {
        warnings.push({
          code: "empty_staging_directory_cleanup_failed",
          message: String(
            error?.message || "Unable to remove empty staging directory"
          ),
          path: targetPath,
        });
      }
    }
  }
  return warnings;
}

function classifiedDownloadError(error, adapter) {
  if (adapter.shouldRediscoverAfterDownloadError?.(error) === true) {
    const classified = extractionError(
      "metadata_refresh_required",
      `Stored document metadata must be refreshed: ${String(
        error?.message || "download reference is stale"
      )}`,
      { stage: "download", metadataRefreshRequired: true }
    );
    classified.cause = error;
    return classified;
  }
  if (error?.stage) return error;
  const classified = extractionError(
    error?.code || "document_download_failed",
    String(error?.message || "Document ZIP download failed"),
    { stage: "download", metadataRefreshRequired: false }
  );
  classified.cause = error;
  return classified;
}

async function processDocumentCategory(input, dependencies = {}) {
  const projectId = validateProjectId(String(input?.projectId || "").trim());
  const category = input?.category;
  const reference = asPlainObject(input?.reference);
  const tempRoot = path.resolve(String(input?.tempRoot || ""));
  if (!input?.tempRoot) throw new TypeError("tempRoot is required");
  if (!DOCUMENT_KEYS.includes(category)) {
    throw new TypeError(`Unsupported document category: ${category}`);
  }
  if (!isUsableDocumentReference(category, reference, projectId)) {
    return {
      projectId,
      category,
      outcome: "skipped",
      reason: unusableReferenceReason(reference),
    };
  }

  const adapter = dependencies.egpAdapter || nationalEgpAdapter;
  const fileSystem = dependencies.fs || fs;
  const verifyPublished =
    dependencies.verifyPublishedDocumentCategory ||
    verifyPublishedDocumentCategory;
  const stageArchive = dependencies.stagePdfArchive || stagePdfArchive;
  const publishStaged =
    dependencies.publishStagedDocumentCategory ||
    publishStagedDocumentCategory;
  const readReusable =
    dependencies.readReusableTemporaryZip || readReusableTemporaryZip;
  const storeZip = dependencies.storeDownloadedZip || storeDownloadedZip;
  const deleteZip = dependencies.deleteTemporaryZip || deleteTemporaryZip;
  const runId = dependencies.runId
    ? dependencies.runId()
    : randomUUID();
  const locatorIdentity = canonicalLocatorIdentity(
    projectId,
    category,
    reference
  );
  const paths = extractionPaths(tempRoot, projectId, category, runId);
  const stagingRoot = path.join(tempRoot, "pdfs", ".staging");
  const zipDependencies = {
    fs: fileSystem,
    randomId: dependencies.randomId,
  };
  let temporaryZip = null;

  try {
    const existing = await verifyPublished(
      {
        categoryDirectory: paths.categoryDirectory,
        locatorIdentity,
      },
      dependencies
    );
    if (existing.verified && input.force !== true) {
      const cleanup = await deleteZip(
        { tempRoot, projectId, category },
        zipDependencies
      );
      return {
        projectId,
        category,
        outcome: "skipped_verified",
        locatorIdentity,
        categoryDirectory: paths.categoryDirectory,
        pdfCount: existing.manifest.pdfs.length,
        cleanupWarnings: cleanup.warnings,
      };
    }

    if (input.redownload !== true) {
      temporaryZip = await readReusable(
        { tempRoot, projectId, category, locatorIdentity },
        zipDependencies
      );
    }
    if (!temporaryZip) {
      let zipBuffer;
      try {
        if (dependencies.beforeDownload) {
          await dependencies.beforeDownload();
        }
        zipBuffer = await adapter.downloadDocument(
          { ...reference, projectId },
          dependencies.downloadOptions || {}
        );
      } catch (error) {
        throw classifiedDownloadError(error, adapter);
      }
      temporaryZip = await storeZip(
        {
          tempRoot,
          projectId,
          category,
          locatorIdentity,
          zipBuffer,
        },
        zipDependencies
      );
    }

    const stagedExtraction = await stageArchive(temporaryZip.zipBuffer, {
      stagingDirectory: paths.stagingDirectory,
      fs: fileSystem,
      createWriteStream: dependencies.createWriteStream,
      openZip: dependencies.openZip,
    });
    const publication = await publishStaged(
      {
        projectId,
        category,
        sourceZipFileName: reference.fileName || `${category}.zip`,
        locatorIdentity,
        downloadMethod:
          reference.downloadMethod || (reference.fileId ? "file_id" : null),
        zipSha256: temporaryZip.zipSha256,
        zipSizeBytes: temporaryZip.zipSizeBytes,
        stagedExtraction,
        categoryDirectory: paths.categoryDirectory,
        processedAt: dependencies.now ? dependencies.now() : new Date(),
      },
      dependencies
    );
    const stagingCleanupWarnings = await pruneRunOwnedStagingParents(
      paths.stagingDirectory,
      stagingRoot,
      fileSystem
    );
    const cleanup = await deleteZip(
      { tempRoot, projectId, category },
      zipDependencies
    );
    return {
      projectId,
      category,
      outcome: "extracted",
      locatorIdentity,
      zipSha256: temporaryZip.zipSha256,
      zipSizeBytes: temporaryZip.zipSizeBytes,
      reusedTemporaryZip: temporaryZip.reused,
      zipDeleted: cleanup.deleted,
      categoryDirectory: publication.categoryDirectory,
      pdfCount: publication.manifest.pdfs.length,
      replacedExisting: publication.replacedExisting,
      cleanupWarnings: [
        ...publication.cleanupWarnings,
        ...stagingCleanupWarnings,
        ...cleanup.warnings,
      ],
    };
  } catch (error) {
    const cleanupWarnings = [];
    try {
      await fileSystem.rm(paths.stagingDirectory, {
        recursive: true,
        force: true,
      });
    } catch (cleanupError) {
      if (error && typeof error === "object") error.cleanupError = cleanupError;
    }
    cleanupWarnings.push(
      ...(await pruneRunOwnedStagingParents(
        paths.stagingDirectory,
        stagingRoot,
        fileSystem
      ))
    );
    const zipPaths = temporaryZipPaths(tempRoot, projectId, category);
    let zipRetained = false;
    try {
      await fileSystem.lstat(zipPaths.zipPath);
      zipRetained = true;
    } catch (statError) {
      if (statError?.code !== "ENOENT" && error && typeof error === "object") {
        error.zipStatusError = statError;
      }
    }
    return {
      projectId,
      category,
      outcome: "failed",
      locatorIdentity,
      zipRetained,
      retainedZipPath: zipRetained ? zipPaths.zipPath : null,
      cleanupWarnings,
      error: {
        code: error?.code || "document_extraction_failed",
        stage: error?.stage || "extraction",
        message: String(error?.message || "Document extraction failed").slice(
          0,
          500
        ),
        metadataRefreshRequired:
          error?.details?.metadataRefreshRequired === true,
      },
    };
  }
}

async function processProjectDocumentExtractions(
  projectInput,
  options = {},
  dependencies = {}
) {
  const project = asPlainObject(projectInput);
  const projectId = validateProjectId(String(project.project_id || "").trim());
  const documents = asPlainObject(project.documents);
  const categories = [];

  for (const category of DOCUMENT_KEYS) {
    categories.push(
      await processDocumentCategory(
        {
          projectId,
          category,
          reference: asPlainObject(documents[category]),
          tempRoot: options.tempRoot,
          force: options.force,
          redownload: options.redownload,
        },
        dependencies
      )
    );
  }

  return {
    projectId,
    categories,
    summary: {
      extracted: categories.filter((item) => item.outcome === "extracted").length,
      skipped: categories.filter((item) => item.outcome.startsWith("skipped"))
        .length,
      failed: categories.filter((item) => item.outcome === "failed").length,
    },
  };
}

module.exports = {
  GovProjectDocumentExtractionError,
  MANIFEST_FILE_NAME,
  MANIFEST_SCHEMA_VERSION,
  MAX_ARCHIVE_ENTRIES,
  MAX_PDF_COUNT,
  MAX_TOTAL_PDF_BYTES,
  isSafePhaseBArchivePath,
  planDocumentExtractionBatch,
  planProjectDocumentExtraction,
  processDocumentCategory,
  processProjectDocumentExtractions,
  publishStagedDocumentCategory,
  stagePdfArchive,
  verifyPublishedDocumentCategory,
};

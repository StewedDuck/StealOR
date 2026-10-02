const FILE_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;

function asPlainObject(project) {
  return typeof project?.toObject === "function" ? project.toObject() : project;
}

function safeZipName(value) {
  const fileName = String(value || "").trim();
  if (
    !fileName ||
    fileName.length > 255 ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(fileName) ||
    !fileName.toLowerCase().endsWith(".zip")
  ) {
    return null;
  }
  return fileName;
}

function safeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildDownloadReference(projectId, extraction) {
  const fileId = String(extraction.sourceFileId || "").trim();
  const fileName = safeZipName(extraction.sourceDocument);

  if (FILE_ID_PATTERN.test(fileId)) {
    const url = new URL(
      "/egp-upload-service/v1/downloadFileTest",
      "https://process5.gprocurement.go.th"
    );
    url.searchParams.set("fileId", fileId);
    return {
      fileId,
      fileName,
      downloadMethod: "file_id",
      downloadUrl: url.toString(),
    };
  }

  const legacyPattern = new RegExp(
    `^pricebuild_[A-Za-z0-9._-]+_${projectId}\\.zip$`,
    "i"
  );
  if (fileName && legacyPattern.test(fileName)) {
    const url = new URL(
      "/egp2procmainWeb/FPRO9965AttachServ",
      "https://process3.gprocurement.go.th"
    );
    url.searchParams.set("projectId", projectId);
    url.searchParams.set("fileName", fileName);
    return {
      fileId: null,
      fileName,
      downloadMethod: "legacy_filename",
      downloadUrl: url.toString(),
    };
  }

  return null;
}

function hasNewPriceEstimate(project) {
  const status = project?.documents?.priceEstimate?.status;
  return Boolean(status && status !== "not_checked");
}

function planProjectMigration(input) {
  const project = asPlainObject(input) || {};
  const projectId = String(project.project_id || "").trim();
  if (!/^\d{11}$/.test(projectId)) {
    return { outcome: "skipped", reason: "invalid_project_id" };
  }
  if (hasNewPriceEstimate(project)) {
    return { outcome: "skipped", reason: "new_metadata_exists" };
  }

  const extraction = project.documentExtraction;
  if (!extraction || typeof extraction !== "object") {
    return { outcome: "skipped", reason: "no_legacy_metadata" };
  }
  const download = buildDownloadReference(projectId, extraction);
  if (!download) {
    return { outcome: "skipped", reason: "no_safe_download_reference" };
  }

  const priceEstimate = {
    status: "available",
    source: extraction.source || "egp",
    lookupMethod: "legacy_document_extraction",
    ...download,
    sha256: extraction.sourceSha256 || null,
    lastCheckedAt: safeDate(extraction.lastAttemptAt),
  };

  // Target only the new nested field. In particular, do not replace the
  // project or remove documentExtraction during this reversible migration.
  return {
    outcome: "planned",
    operation: {
      updateOne: {
        filter: project._id ? { _id: project._id } : { project_id: projectId },
        update: { $set: { "documents.priceEstimate": priceEstimate } },
        upsert: false,
      },
    },
    backup: {
      _id: project._id ?? null,
      project_id: projectId,
      documentExtraction: extraction,
      documents: project.documents ?? null,
    },
  };
}

function buildGovProjectDocumentMigrationPlan(projects) {
  if (!Array.isArray(projects)) throw new TypeError("projects must be an array");

  const operations = [];
  const backups = [];
  const skippedByReason = {};
  for (const project of projects) {
    const result = planProjectMigration(project);
    if (result.outcome === "planned") {
      operations.push(result.operation);
      backups.push(result.backup);
      continue;
    }
    skippedByReason[result.reason] = (skippedByReason[result.reason] || 0) + 1;
  }

  return {
    summary: {
      scanned: projects.length,
      planned: operations.length,
      skipped: projects.length - operations.length,
      skippedByReason,
    },
    operations,
    backups,
  };
}

module.exports = {
  buildGovProjectDocumentMigrationPlan,
  planProjectMigration,
};

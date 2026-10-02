const GovProject = require("../models/GovProject");
const {
  getDraftEbiddingArchive,
  getInvitationArchive,
  getPriceEstimateArchive,
  getPriceEstimateDocument,
  validateProjectId,
} = require("../services/egp/egpDocumentService");
const {
  enrichAndSaveProjects,
} = require("../services/govProjectBatchImportService");
const {
  getLocalFilteredProjects,
} = require("../services/localProjectProvider");

function errorMessage(error) {
  return String(error?.message || "Document enrichment failed").slice(0, 500);
}

async function enrichProject(req, res) {
  let project;
  try {
    const projectId = validateProjectId(req.params.projectId);
    project = await GovProject.findOne({ project_id: projectId });
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const previousAttempts = Number(project.documentExtraction?.attemptCount || 0);
    project.documentExtraction = {
      ...project.documentExtraction?.toObject(),
      status: "processing",
      attemptCount: previousAttempts + 1,
      lastAttemptAt: new Date(),
      extractedAt: null,
      error: null,
    };
    await project.save();

    const document = await getPriceEstimateDocument(projectId);
    const extractedAt = new Date();
    project.documentExtraction = {
      status: "text_extracted",
      attemptCount: previousAttempts + 1,
      lastAttemptAt: project.documentExtraction.lastAttemptAt,
      extractedAt,
      error: null,
      source: "egp",
      sourceDocumentType: "price_estimate",
      sourceDocument: document.sourceDocument,
      sourceFileId: document.sourceFileId,
      sourceSha256: document.sourceSha256,
      pdfFileNames: document.pdfFileNames,
      extractedText: document.extractedText,
      textLength: document.textLength,
    };
    await project.save();

    return res.json({
      success: true,
      data: {
        projectId,
        status: "text_extracted",
        sourceDocumentType: "price_estimate",
        sourceDocument: document.sourceDocument,
        pdfFileNames: document.pdfFileNames,
        textLength: document.textLength,
      },
    });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    if (project) {
      try {
        const document = error.documentMetadata || {};
        project.documentExtraction.status = "failed";
        project.documentExtraction.error = errorMessage(error);
        project.documentExtraction.extractedAt = null;
        project.documentExtraction.source = document.source || "egp";
        project.documentExtraction.sourceDocumentType =
          document.sourceDocumentType || "price_estimate";
        project.documentExtraction.sourceDocument =
          document.sourceDocument || null;
        project.documentExtraction.sourceFileId = document.sourceFileId || null;
        project.documentExtraction.sourceSha256 = document.sourceSha256 || null;
        project.documentExtraction.pdfFileNames = document.pdfFileNames || [];
        project.documentExtraction.textLength = Number(
          document.textLength || 0
        );
        project.documentExtraction.extractedText = "";
        await project.save();
      } catch (saveError) {
        console.error("Unable to save document extraction failure:", saveError);
      }
    }
    if (statusCode >= 500) console.error("Government document enrichment error:", error);
    return res.status(statusCode).json({
      success: false,
      error: errorMessage(error),
    });
  }
}

async function importEnrichedProjects(req, res) {
  try {
    const projects = await getLocalFilteredProjects({ limit: req.body?.limit });
    const summary = await enrichAndSaveProjects(projects);

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Government project batch import error:", error);
    return res.status(500).json({
      success: false,
      error: errorMessage(error),
    });
  }
}

function safeDownloadName(fileName, projectId, fallbackPrefix = "price-estimate") {
  const normalized = String(fileName || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/[^A-Za-z0-9._-]/g, "_");
  return normalized.toLowerCase().endsWith(".zip")
    ? normalized
    : `${fallbackPrefix}-${projectId}.zip`;
}

function newDocumentMetadata(project, key) {
  const metadata = project.documents?.[key];
  if (metadata?.status !== "available") return {};
  return {
    fileId: metadata.fileId || null,
    fileName: metadata.fileName || null,
    downloadMethod: metadata.downloadMethod || null,
    revision: metadata.revision ?? null,
    version: metadata.version ?? null,
  };
}

function storedPriceEstimateMetadata(project) {
  const current = newDocumentMetadata(project, "priceEstimate");
  if (current.fileId || current.downloadMethod === "legacy_filename") {
    return current;
  }

  const extraction = project.documentExtraction || {};
  return {
    fileId: extraction.sourceFileId || null,
    fileName: extraction.sourceDocument || null,
    downloadMethod: extraction.sourceFileId
      ? "file_id"
      : String(extraction.sourceDocument || "").startsWith("pricebuild_")
        ? "legacy_filename"
        : null,
  };
}

function sendZipArchive(res, archive, projectId, fallbackPrefix) {
  const fileName = safeDownloadName(
    archive.fileName,
    projectId,
    fallbackPrefix
  );
  res.set({
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Content-Length": String(archive.zipBuffer.length),
    "Cache-Control": "private, no-store",
  });
  return res.send(archive.zipBuffer);
}

async function downloadProjectArchive(
  req,
  res,
  { getArchive, getKnownMetadata, fallbackPrefix }
) {
  try {
    const projectId = validateProjectId(req.params.projectId);
    const project = await GovProject.findOne({ project_id: projectId });
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    // Stored metadata is only a cached locator. The document service may
    // rediscover it from projectId when e-GP reports that it has gone stale.
    const archive = await getArchive(projectId, getKnownMetadata(project));
    return sendZipArchive(res, archive, projectId, fallbackPrefix);
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    if (statusCode >= 500) {
      console.error("Government document download error:", error);
    }
    return res.status(statusCode).json({
      success: false,
      error: errorMessage(error),
    });
  }
}

function downloadOriginalDocument(req, res) {
  return downloadProjectArchive(req, res, {
    getArchive: getPriceEstimateArchive,
    getKnownMetadata: storedPriceEstimateMetadata,
    fallbackPrefix: "price-estimate",
  });
}

function downloadInvitationDocument(req, res) {
  return downloadProjectArchive(req, res, {
    getArchive: getInvitationArchive,
    getKnownMetadata: (project) => newDocumentMetadata(project, "invitation"),
    fallbackPrefix: "invitation",
  });
}

function downloadDraftEbiddingDocument(req, res) {
  return downloadProjectArchive(req, res, {
    getArchive: getDraftEbiddingArchive,
    getKnownMetadata: (project) => newDocumentMetadata(project, "draftEbidding"),
    fallbackPrefix: "draft-ebidding",
  });
}

module.exports = {
  downloadDraftEbiddingDocument,
  downloadInvitationDocument,
  downloadOriginalDocument,
  enrichProject,
  importEnrichedProjects,
};

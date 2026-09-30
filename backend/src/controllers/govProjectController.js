const GovProject = require("../models/GovProject");
const {
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

module.exports = { enrichProject, importEnrichedProjects };

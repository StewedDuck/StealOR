const GovProject = require("../models/GovProject");
const {
  getPriceEstimateDocument,
  validateProjectId,
} = require("./egp/egpDocumentService");

const DEFAULT_MAX_OPERATIONS_PER_CHUNK = 100;
const DEFAULT_MAX_CHUNK_BYTES = 8 * 1024 * 1024;

function errorMessage(error) {
  return String(error?.message || "Document enrichment failed").slice(0, 500);
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function projectFields(project, projectId, documentExtraction) {
  return {
    project_id: projectId,
    project_name: project.project_name,
    dept_name: project.dept_name,
    dept_code: project.dept_code,
    budget_amount: numericValue(project.budget_amount),
    sum_price_agree: numericValue(project.sum_price_agree),
    winner_tin: project.winner_tin ?? null,
    winner_name: project.winner_name ?? null,
    contract_status: project.contract_status,
    raw_data: project,
    documentExtraction,
  };
}

function operationSize(operation) {
  return Buffer.byteLength(JSON.stringify(operation), "utf8");
}

function chunkOperations(
  operations,
  {
    maxOperations = DEFAULT_MAX_OPERATIONS_PER_CHUNK,
    maxBytes = DEFAULT_MAX_CHUNK_BYTES,
  } = {}
) {
  const chunks = [];
  let chunk = [];
  let chunkBytes = 0;

  for (const operation of operations) {
    const bytes = operationSize(operation);
    const chunkIsFull =
      chunk.length > 0 &&
      (chunk.length >= maxOperations || chunkBytes + bytes > maxBytes);

    if (chunkIsFull) {
      chunks.push(chunk);
      chunk = [];
      chunkBytes = 0;
    }

    chunk.push(operation);
    chunkBytes += bytes;
  }

  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

async function enrichAndSaveProjects(projects, dependencies = {}) { 
  if (!Array.isArray(projects)) {
    throw new TypeError("projects must be an array");
  }

  const documentFetcher =
    dependencies.getPriceEstimateDocument || getPriceEstimateDocument;
  const projectModel = dependencies.GovProject || GovProject;
  const maxOperations =
    dependencies.maxOperationsPerChunk || DEFAULT_MAX_OPERATIONS_PER_CHUNK;
  const maxBytes = dependencies.maxChunkBytes || DEFAULT_MAX_CHUNK_BYTES;

  const uniqueProjects = [];
  const seenProjectIds = new Set();

  for (const project of projects) {
    const projectId = String(project?.project_id ?? "").trim();
    if (seenProjectIds.has(projectId)) continue;
    seenProjectIds.add(projectId);
    uniqueProjects.push({ project, projectId });
  }

  const operations = [];
  let succeeded = 0;
  let failed = 0;

  // Deliberately sequential: real e-GP archives can be around 50 MB each.
  for (const { project, projectId } of uniqueProjects) {
    let safeProjectId;
    try {
      safeProjectId = validateProjectId(projectId);
    } catch (_error) {
      failed += 1;
      continue;
    }

    const lastAttemptAt = new Date();
    let documentExtraction;

    try {
      const document = await documentFetcher(safeProjectId);
      documentExtraction = {
        status: "text_extracted",
        attemptCount: 1,
        lastAttemptAt,
        extractedAt: new Date(),
        error: null,
        source: document.source || "egp",
        sourceDocumentType:
          document.sourceDocumentType || "price_estimate",
        sourceDocument: document.sourceDocument,
        sourceFileId: document.sourceFileId,
        sourceSha256: document.sourceSha256,
        pdfFileNames: document.pdfFileNames || [],
        textLength: document.textLength,
        extractedText: document.extractedText,
      };
      succeeded += 1;
    } catch (error) {
      const document = error.documentMetadata || {};
      documentExtraction = {
        status: "failed",
        attemptCount: 1,
        lastAttemptAt,
        extractedAt: null,
        error: errorMessage(error),
        source: document.source || "egp",
        sourceDocumentType:
          document.sourceDocumentType || "price_estimate",
        sourceDocument: document.sourceDocument || null,
        sourceFileId: document.sourceFileId || null,
        sourceSha256: document.sourceSha256 || null,
        pdfFileNames: document.pdfFileNames || [],
        textLength: Number(document.textLength || 0),
        extractedText: "",
      };
      failed += 1;
    }

    operations.push({
      updateOne: {
        filter: { project_id: safeProjectId },
        update: {
          $set: projectFields(project, safeProjectId, documentExtraction),
        },
        upsert: true,
      },
    });
  }

  let upserted = 0;
  let modified = 0;
  const chunks = chunkOperations(operations, { maxOperations, maxBytes });

  for (const chunk of chunks) {
    const result = await projectModel.bulkWrite(chunk, { ordered: false });
    upserted += Number(result?.upsertedCount || 0);
    modified += Number(result?.modifiedCount || 0);
  }

  return {
    received: projects.length,
    unique: uniqueProjects.length,
    succeeded,
    failed,
    upserted,
    modified,
  };
}

module.exports = {
  enrichAndSaveProjects,
  chunkOperations,
};

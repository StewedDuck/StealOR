const fs = require("node:fs/promises");
const path = require("node:path");

const TOR_SECTION_CODES = Object.freeze([
  "project_details",
  "objective",
  "scope_of_work",
  "qualification_general",
  "qualification_project_specific",
  "technical_requirement",
  "deliverable",
]);

function validateEvidenceList(value, field, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return;
  }
  for (const [index, evidence] of value.entries()) {
    if (!evidence || typeof evidence !== "object") errors.push(`${field}[${index}] is invalid`);
    else if (evidence.evidenceStatus !== "VERIFIED") errors.push(`${field}[${index}] is not VERIFIED`);
  }
}

const SOURCE_CATEGORIES = Object.freeze(["priceEstimate", "invitation", "draftEbidding"]);

function resolveAuthoritativeAbsences(analysis, authoritativeDocuments) {
  const warnings = analysis?.coverage?.warnings;
  if (!Array.isArray(warnings) || warnings.length === 0) return [];
  if (!authoritativeDocuments || typeof authoritativeDocuments !== "object") return [];
  if (warnings.some((warning) => warning?.code !== "MISSING_MANIFEST")) return [];

  const missingCategories = [...new Set(warnings.map((warning) => warning?.category))];
  if (missingCategories.some((category) => !SOURCE_CATEGORIES.includes(category))) return [];
  if (missingCategories.some((category) => authoritativeDocuments?.[category]?.status !== "not_found")) return [];

  const coverageCategories = analysis?.coverage?.categories;
  if (!coverageCategories || missingCategories.some((category) => coverageCategories?.[category]?.manifestAvailable !== false)) return [];
  const uncoveredCategories = SOURCE_CATEGORIES.filter((category) => coverageCategories?.[category]?.manifestAvailable === false);
  if (uncoveredCategories.some((category) => !missingCategories.includes(category))) return [];

  const processing = analysis?.processing;
  if (processing?.processedRequests !== processing?.totalRequests) return [];
  if (!Array.isArray(processing?.documents)) return [];
  if (processing.documents.some((document) => document?.processed !== true || (Array.isArray(document?.errors) && document.errors.length > 0))) return [];
  if (Array.isArray(analysis?.diagnostics?.errors) && analysis.diagnostics.errors.length > 0) return [];
  return missingCategories.sort();
}

function validateAnalysisForImport(analysis, expectedProjectId, options = {}) {
  const errors = [];
  const projectId = String(analysis?.projectId || "");
  if (!/^\d{11}$/.test(projectId)) errors.push("projectId must contain exactly 11 digits");
  if (expectedProjectId && projectId !== expectedProjectId) errors.push("projectId does not match its output directory");
  if (analysis?.schemaVersion !== 3) errors.push("schemaVersion must be 3");
  if (analysis?.status !== "complete") errors.push("analysis status must be complete");
  if (analysis?.coverage?.status !== "complete") errors.push("source coverage must be complete");
  if (analysis?.processing?.complete !== true) errors.push("processing must be complete");
  if (!Number.isInteger(analysis?.processing?.documentCount) || analysis.processing.documentCount < 1) {
    errors.push("at least one eligible source document is required");
  }
  if (analysis?.processing?.processedRequests !== analysis?.processing?.totalRequests) {
    errors.push("all eligible documents must be processed");
  }
  if (!analysis?.fingerprint || typeof analysis.fingerprint !== "string") errors.push("fingerprint is required");

  const sections = analysis?.torSummary?.sections;
  if (!sections || typeof sections !== "object") errors.push("torSummary.sections is required");
  else {
    const arrays = [
      ["objective", sections.objectives?.items],
      ["scope_of_work", sections.scopeOfWork?.items],
      ["qualification_general", sections.contractorQualifications?.generalLegal],
      ["qualification_project_specific", sections.contractorQualifications?.projectSpecific],
      ["technical_requirement", sections.technicalRequirements?.items],
      ["deliverable", sections.deliverables?.items],
    ];
    if (!sections.projectDetails) errors.push("project_details is required");
    else validateEvidenceList(sections.projectDetails.evidence, "project_details.evidence", errors);
    for (const [code, items] of arrays) {
      if (!Array.isArray(items)) errors.push(`${code} summary must be an array`);
      else for (const [index, item] of items.entries()) validateEvidenceList(item?.evidence, `${code}[${index}].evidence`, errors);
    }
  }

  for (const name of ["referencePriceEstimate", "allocatedBudget"]) {
    const value = analysis?.prices?.[name];
    if (!value || typeof value.status !== "string") errors.push(`prices.${name} is required`);
    else validateEvidenceList(value.evidence, `prices.${name}.evidence`, errors);
    const suspiciousCandidate = (analysis?.diagnostics?.candidateDiagnostics || []).find((candidate) =>
      candidate?.group === name &&
      candidate?.accepted === false &&
      candidate?.validatedCandidate?.evidenceStatus === "VERIFIED" &&
      candidate?.validatedCandidate?.interpretationReason === "price_context_or_amount_not_supported"
    );
    if (value?.status === "not_found" && suspiciousCandidate) {
      errors.push(`prices.${name} has a verified candidate rejected for missing context; reanalysis is required`);
    }
  }
  const deadline = analysis?.deadlines?.biddingClosingDate;
  if (!deadline || typeof deadline.status !== "string" || typeof deadline.coverageStatus !== "string") {
    errors.push("deadlines.biddingClosingDate with coverageStatus is required");
  } else validateEvidenceList(deadline.evidence, "deadlines.biddingClosingDate.evidence", errors);
  if (!analysis?.documentAssessment || typeof analysis.documentAssessment.coverageStatus !== "string") {
    errors.push("documentAssessment with coverageStatus is required");
  }

  const authoritativeAbsences = resolveAuthoritativeAbsences(analysis, options.authoritativeDocuments);
  if (authoritativeAbsences.length > 0) {
    const permittedIncompleteErrors = new Set([
      "analysis status must be complete",
      "source coverage must be complete",
      "processing must be complete",
    ]);
    for (let index = errors.length - 1; index >= 0; index -= 1) {
      if (permittedIncompleteErrors.has(errors[index])) errors.splice(index, 1);
    }
  }
  return {
    projectId: projectId || expectedProjectId || null,
    suitable: errors.length === 0,
    errors,
    authoritativeAbsences,
  };
}

async function validateLocalAnalysisOutputs(outputRoot, options = {}, dependencies = {}) {
  const io = dependencies.fs || fs;
  const root = path.resolve(outputRoot);
  let entries = [];
  try { entries = await io.readdir(root, { withFileTypes: true }); } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const requested = options.projectIds ? new Set(options.projectIds) : null;
  const ids = entries
    .filter((entry) => entry.isDirectory() && /^\d{11}$/.test(entry.name) && (!requested || requested.has(entry.name)))
    .map((entry) => entry.name)
    .sort();
  const results = [];
  for (const projectId of ids) {
    const analysisPath = path.join(root, projectId, "analysis.json");
    try {
      const analysis = JSON.parse(await io.readFile(analysisPath, "utf8"));
      results.push({ ...validateAnalysisForImport(analysis, projectId), analysisPath });
    } catch (error) {
      results.push({ projectId, suitable: false, errors: [`Unable to read analysis.json: ${error.message}`], analysisPath });
    }
  }
  if (requested) {
    for (const projectId of requested) {
      if (!results.some((item) => item.projectId === projectId)) {
        results.push({ projectId, suitable: false, errors: ["analysis.json is missing"], analysisPath: path.join(root, projectId, "analysis.json") });
      }
    }
    results.sort((left, right) => left.projectId.localeCompare(right.projectId));
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date((dependencies.now || Date.now)()).toISOString(),
    outputRoot: root,
    torSectionCodes: TOR_SECTION_CODES,
    summary: { total: results.length, suitable: results.filter((item) => item.suitable).length, unsuitable: results.filter((item) => !item.suitable).length },
    projects: results,
  };
}

module.exports = {
  SOURCE_CATEGORIES,
  TOR_SECTION_CODES,
  resolveAuthoritativeAbsences,
  validateAnalysisForImport,
  validateLocalAnalysisOutputs,
};

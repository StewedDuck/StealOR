const { isDeepStrictEqual } = require("node:util");
const { validateAnalysisForImport } = require("./analysisValidation");

function normalizeCanonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeCanonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key, item]) => key !== "_id" && item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeCanonical(item)]));
  }
  return value;
}

function canonicallyEqual(left, right) {
  return isDeepStrictEqual(normalizeCanonical(left), normalizeCanonical(right));
}

function amountValue(result) {
  return {
    amount: result?.status === "found" ? result.amount : null,
    currency: result?.status === "found" ? result.currency : null,
  };
}

function summaryValues(items) {
  return Array.isArray(items)
    ? items.map((item) => String(item?.text || "").trim()).filter(Boolean)
    : [];
}

function sanitizeAnalysisForMongo(analysis, options = {}) {
  const validation = validateAnalysisForImport(analysis, options.expectedProjectId, {
    authoritativeDocuments: options.authoritativeDocuments,
  });
  if (!validation.suitable) throw new Error(`Invalid schema-v3 analysis: ${validation.errors.join("; ")}`);
  const sections = analysis.torSummary.sections;
  const closing = analysis.deadlines.biddingClosingDate;
  const sanitized = {
    schemaVersion: analysis.schemaVersion,
    analysisVersion: analysis.analysisVersion,
    generatedAt: analysis.generatedAt,
    fingerprint: analysis.fingerprint,
    referencePriceEstimate: amountValue(analysis.prices.referencePriceEstimate),
    allocatedBudget: amountValue(analysis.prices.allocatedBudget),
    projectDetails: sections.projectDetails?.text || null,
    objectives: summaryValues(sections.objectives?.items),
    scopeOfWork: summaryValues(sections.scopeOfWork?.items),
    contractorQualifications: {
      generalLegal: summaryValues(sections.contractorQualifications?.generalLegal),
      projectSpecific: summaryValues(sections.contractorQualifications?.projectSpecific),
    },
    technicalRequirements: summaryValues(sections.technicalRequirements?.items),
    deliverables: summaryValues(sections.deliverables?.items),
    biddingClosingDate: {
      date: closing?.status === "found" ? closing.normalizedDate : null,
      startTime: closing?.status === "found" ? closing.submissionWindow?.start || null : null,
      endTime: closing?.status === "found" ? closing.submissionWindow?.end || null : null,
      dateTime: closing?.status === "found" ? closing.closingDateTime || null : null,
      timezone: closing?.status === "found" ? closing.timezone || null : null,
    },
  };
  return JSON.parse(JSON.stringify(sanitized));
}

function duplicateIds(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const id = selector(item);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([id]) => id).sort();
}

function buildImportPlan(localAnalyses, projects) {
  if (!Array.isArray(localAnalyses) || !Array.isArray(projects)) throw new TypeError("localAnalyses and projects must be arrays");
  const duplicateLocalProjectIds = duplicateIds(localAnalyses, (item) => String(item.analysis?.projectId || item.projectId || ""));
  const duplicateDatabaseProjectIds = duplicateIds(projects, (item) => String(item.project_id || ""));
  const databaseById = new Map(projects.map((project) => [String(project.project_id), project]));
  const plans = [];
  const reports = [];

  for (const item of localAnalyses) {
    const projectId = String(item.analysis?.projectId || item.projectId || "");
    if (duplicateLocalProjectIds.includes(projectId)) {
      reports.push({ projectId, outcome: "duplicate_local", errors: ["Duplicate local project ID"] });
      continue;
    }
    if (duplicateDatabaseProjectIds.includes(projectId)) {
      reports.push({ projectId, outcome: "duplicate_database", errors: ["Duplicate database project ID"] });
      continue;
    }
    const project = databaseById.get(projectId);
    if (!project) {
      reports.push({ projectId, outcome: "missing", errors: ["GovProject record not found"] });
      continue;
    }
    const validation = validateAnalysisForImport(item.analysis, item.projectId || projectId, {
      authoritativeDocuments: project.documents,
    });
    if (!validation.suitable) {
      reports.push({ projectId, outcome: "invalid", errors: validation.errors });
      continue;
    }
    const next = sanitizeAnalysisForMongo(item.analysis, {
      expectedProjectId: item.projectId || projectId,
      authoritativeDocuments: project.documents,
    });
    const prior = project.procurementAnalysis;
    if (canonicallyEqual(prior, next)) {
      reports.push({ projectId, outcome: "unchanged", errors: [], authoritativeAbsences: validation.authoritativeAbsences });
      continue;
    }
    const filter = { _id: project._id, project_id: projectId };
    if (project.updatedAt) filter.updatedAt = project.updatedAt;
    else if (Object.prototype.hasOwnProperty.call(project, "procurementAnalysis")) filter.procurementAnalysis = prior;
    else filter.procurementAnalysis = { $exists: false };
    const plan = {
      projectId,
      priorAnalysis: prior,
      hadPriorAnalysis: Object.prototype.hasOwnProperty.call(project, "procurementAnalysis"),
      importedAnalysis: next,
      operation: { updateOne: { filter, update: { $set: { procurementAnalysis: next } }, upsert: false } },
    };
    plans.push(plan);
    reports.push({ projectId, outcome: "would_update", errors: [], authoritativeAbsences: validation.authoritativeAbsences });
  }
  return {
    plans,
    reports,
    duplicateLocalProjectIds,
    duplicateDatabaseProjectIds,
    summary: {
      total: localAnalyses.length,
      valid: reports.filter((item) => ["would_update", "unchanged"].includes(item.outcome)).length,
      planned: plans.length,
      unchanged: reports.filter((item) => item.outcome === "unchanged").length,
      invalid: reports.filter((item) => item.outcome === "invalid").length,
      missing: reports.filter((item) => item.outcome === "missing").length,
      duplicates: reports.filter((item) => item.outcome.startsWith("duplicate_")).length,
    },
  };
}

async function applyImportPlans(plans, updateOne) {
  const results = [];
  for (const plan of plans) {
    try {
      const result = await updateOne(plan.operation.updateOne.filter, plan.operation.updateOne.update, { upsert: false });
      results.push({ projectId: plan.projectId, matchedCount: result.matchedCount || 0, modifiedCount: result.modifiedCount || 0, conflict: result.matchedCount !== 1 });
    } catch (error) {
      results.push({ projectId: plan.projectId, matchedCount: 0, modifiedCount: 0, conflict: false, error: error.message });
    }
  }
  return results;
}

async function verifyImportPlans(plans, findOne) {
  const results = [];
  for (const plan of plans) {
    const current = await findOne({ _id: plan.operation.updateOne.filter._id, project_id: plan.projectId }, { projection: { procurementAnalysis: 1 } });
    results.push({ projectId: plan.projectId, verified: Boolean(current) && canonicallyEqual(current.procurementAnalysis, plan.importedAnalysis) });
  }
  return results;
}

function buildRollbackPlans(backup, projects) {
  if (backup?.type !== "procurement-analysis-backup" || backup?.schemaVersion !== 1 || !Array.isArray(backup.records)) {
    throw new Error("Invalid procurement-analysis backup file");
  }
  const byId = new Map(projects.map((project) => [String(project.project_id), project]));
  const plans = [];
  const reports = [];
  for (const record of backup.records) {
    const project = byId.get(record.projectId);
    if (!project) { reports.push({ projectId: record.projectId, outcome: "missing" }); continue; }
    if (!canonicallyEqual(project.procurementAnalysis, record.importedAnalysis)) {
      reports.push({ projectId: record.projectId, outcome: "guard_mismatch" });
      continue;
    }
    const update = record.hadPriorAnalysis
      ? { $set: { procurementAnalysis: record.priorAnalysis } }
      : { $unset: { procurementAnalysis: "" } };
    plans.push({
      projectId: record.projectId,
      expectedAfter: record.hadPriorAnalysis ? record.priorAnalysis : undefined,
      expectsField: record.hadPriorAnalysis,
      operation: { updateOne: { filter: { _id: project._id, project_id: record.projectId, "procurementAnalysis.fingerprint": record.importedAnalysis.fingerprint }, update, upsert: false } },
    });
    reports.push({ projectId: record.projectId, outcome: "would_rollback" });
  }
  return { plans, reports };
}

module.exports = {
  applyImportPlans,
  buildImportPlan,
  buildRollbackPlans,
  canonicallyEqual,
  sanitizeAnalysisForMongo,
  verifyImportPlans,
};

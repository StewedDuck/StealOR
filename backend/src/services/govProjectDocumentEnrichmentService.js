const { isDeepStrictEqual } = require("node:util");
const {
  discoverProjectDocuments,
  selectProcurementDocument,
} = require("./egp/egpDocumentService");
const {
  DOCUMENT_KEYS,
  mergeDocumentReference,
  persistableDocumentReference,
} = require("./egp/documentReferencePolicy");

const DEFAULT_DELAY_MS = 750;
const MAX_DELAY_MS = 5_000;

function asPlainObject(value) {
  if (!value || typeof value !== "object") return {};
  return typeof value.toObject === "function"
    ? value.toObject({ depopulate: true })
    : value;
}

function normalizeForComparison(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeForComparison);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, item]) => key !== "_id" && item !== undefined)
        .map(([key, item]) => [key, normalizeForComparison(item)])
        .sort(([left], [right]) => left.localeCompare(right))
    );
  }
  return value;
}

function referencesEqual(left, right) {
  return isDeepStrictEqual(
    normalizeForComparison(persistableDocumentReference(left)),
    normalizeForComparison(persistableDocumentReference(right))
  );
}

function boundedDelay(value = DEFAULT_DELAY_MS) {
  const delay = Number(value);
  if (!Number.isInteger(delay) || delay < 0 || delay > MAX_DELAY_MS) {
    throw new TypeError(`delayMs must be an integer from 0 to ${MAX_DELAY_MS}`);
  }
  return delay;
}

function buildProjectEnrichmentPlan(projectInput, discovery) {
  const project = asPlainObject(projectInput);
  const projectId = String(project.project_id || "").trim();
  const storedDocuments = asPlainObject(project.documents);
  const observedDocuments = asPlainObject(discovery?.documents);
  const effectiveDocuments = {};
  const categories = {};
  const updateSet = {};

  for (const category of DOCUMENT_KEYS) {
    const stored = asPlainObject(storedDocuments[category]);
    const observed = asPlainObject(observedDocuments[category]);
    const merged = mergeDocumentReference({
      projectId,
      category,
      stored,
      observed,
    });
    effectiveDocuments[category] = merged.effective;
    const changed = !referencesEqual(stored, merged.effective);
    if (changed) updateSet[`documents.${category}`] = merged.effective;
    categories[category] = {
      storedStatus: stored.status || "not_checked",
      observedStatus: observed.status || null,
      effectiveStatus: merged.effective.status || "not_checked",
      lookupMethod: observed.lookupMethod || null,
      action: merged.action,
      discrepancy: merged.discrepancy,
      storedLocatorIdentity: merged.storedLocatorIdentity,
      observedLocatorIdentity: merged.observedLocatorIdentity,
      errorCode: observed.error?.code || null,
      errorKind: observed.error?.kind || null,
      changed,
    };
  }

  const previousSelection = storedDocuments.selectedProcurementDocument ?? null;
  const effectiveSelection = selectProcurementDocument(effectiveDocuments);
  if (previousSelection !== effectiveSelection) {
    updateSet["documents.selectedProcurementDocument"] = effectiveSelection;
  }

  const hasChanges = Object.keys(updateSet).length > 0;
  const filter = { _id: project._id, project_id: projectId };
  if (project.updatedAt) filter.updatedAt = project.updatedAt;
  else if (Object.prototype.hasOwnProperty.call(project, "documents")) {
    // Older records may predate timestamps. Match their complete document
    // snapshot so a concurrent metadata change still becomes a conflict.
    filter.documents = storedDocuments;
  } else {
    filter.documents = { $exists: false };
  }

  return {
    projectId,
    priorDocuments: storedDocuments,
    effectiveDocuments: {
      ...effectiveDocuments,
      selectedProcurementDocument: effectiveSelection,
    },
    categories,
    previousSelection,
    effectiveSelection,
    changedPaths: Object.keys(updateSet),
    operation: hasChanges
      ? {
          updateOne: {
            filter,
            update: { $set: updateSet },
            upsert: false,
          },
        }
      : null,
  };
}

function createSummary(total) {
  return {
    existing: total,
    processed: 0,
    planned: 0,
    unchanged: 0,
    failed: 0,
    matched: 0,
    modified: 0,
    conflicts: 0,
    categoryObserved: Object.fromEntries(DOCUMENT_KEYS.map((key) => [key, {}])),
    categoryActions: Object.fromEntries(DOCUMENT_KEYS.map((key) => [key, {}])),
  };
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

async function planDocumentEnrichment(projects, options = {}, dependencies = {}) {
  if (!Array.isArray(projects)) throw new TypeError("projects must be an array");
  const discover = dependencies.discoverProjectDocuments || discoverProjectDocuments;
  const sleep = dependencies.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const delayMs = boundedDelay(options.delayMs ?? DEFAULT_DELAY_MS);
  const plans = [];
  const reports = [];
  const summary = createSummary(projects.length);

  for (let index = 0; index < projects.length; index += 1) {
    const project = asPlainObject(projects[index]);
    const projectId = String(project.project_id || "").trim();
    try {
      const discovery = await discover(projectId);
      const plan = buildProjectEnrichmentPlan(project, discovery);
      plans.push(plan);
      summary.processed += 1;
      if (plan.operation) summary.planned += 1;
      else summary.unchanged += 1;
      for (const category of DOCUMENT_KEYS) {
        increment(
          summary.categoryObserved[category],
          plan.categories[category].observedStatus || "missing"
        );
        increment(
          summary.categoryActions[category],
          plan.categories[category].action
        );
      }
      reports.push({
        projectId,
        outcome: plan.operation ? "would_update" : "unchanged",
        categories: plan.categories,
        previousSelection: plan.previousSelection,
        effectiveSelection: plan.effectiveSelection,
        changedPaths: plan.changedPaths,
      });
    } catch (error) {
      summary.failed += 1;
      reports.push({
        projectId,
        outcome: "failed",
        error: {
          code: error?.code || "DOCUMENT_ENRICHMENT_FAILED",
          message: String(error?.message || "Document enrichment failed").slice(0, 500),
        },
      });
    }

    if (delayMs > 0 && index < projects.length - 1) await sleep(delayMs);
  }

  return { plans, reports, summary, delayMs };
}

async function applyDocumentEnrichmentPlans(plans, dependencies = {}) {
  if (!Array.isArray(plans)) throw new TypeError("plans must be an array");
  const updateOne = dependencies.updateOne;
  if (typeof updateOne !== "function") throw new TypeError("updateOne is required");

  const results = [];
  let matched = 0;
  let modified = 0;
  let conflicts = 0;
  for (const plan of plans) {
    if (!plan.operation) continue;
    const { filter, update, upsert } = plan.operation.updateOne;
    const result = await updateOne(filter, update, { upsert });
    const matchedCount = Number(result?.matchedCount || 0);
    const modifiedCount = Number(result?.modifiedCount || 0);
    matched += matchedCount;
    modified += modifiedCount;
    if (matchedCount === 0) conflicts += 1;
    results.push({
      projectId: plan.projectId,
      outcome: matchedCount === 0 ? "conflict" : "updated",
      matchedCount,
      modifiedCount,
    });
  }
  return { matched, modified, conflicts, results };
}

module.exports = {
  DEFAULT_DELAY_MS,
  MAX_DELAY_MS,
  applyDocumentEnrichmentPlans,
  boundedDelay,
  buildProjectEnrichmentPlan,
  planDocumentEnrichment,
  referencesEqual,
};

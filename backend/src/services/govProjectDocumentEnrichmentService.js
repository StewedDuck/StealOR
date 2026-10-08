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
const DEFAULT_POST_PASS_COOLDOWN_MS = 60_000;
const MAX_POST_PASS_COOLDOWN_MS = 600_000;
const RATE_LIMIT_ERROR_CODE = "EGP_RATE_LIMITED";

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

function boundedPostPassCooldown(value = DEFAULT_POST_PASS_COOLDOWN_MS) {
  const delay = Number(value);
  if (
    !Number.isInteger(delay) ||
    delay < 0 ||
    delay > MAX_POST_PASS_COOLDOWN_MS
  ) {
    throw new TypeError(
      `postPassCooldownMs must be an integer from 0 to ${MAX_POST_PASS_COOLDOWN_MS}`
    );
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

function createPlanReport(plan) {
  return {
    projectId: plan.projectId,
    outcome: plan.operation ? "would_update" : "unchanged",
    categories: plan.categories,
    previousSelection: plan.previousSelection,
    effectiveSelection: plan.effectiveSelection,
    changedPaths: plan.changedPaths,
  };
}

function summarizePlans(total, plans, reports) {
  const summary = createSummary(total);
  summary.processed = plans.length;
  summary.failed = reports.filter((report) => report.outcome === "failed").length;
  for (const plan of plans) {
    if (plan.operation) summary.planned += 1;
    else summary.unchanged += 1;
    for (const category of DOCUMENT_KEYS) {
      increment(
        summary.categoryObserved[category],
        plan.categories[category].observedStatus || "missing"
      );
      increment(summary.categoryActions[category], plan.categories[category].action);
    }
  }
  return summary;
}

async function planDocumentEnrichment(projects, options = {}, dependencies = {}) {
  if (!Array.isArray(projects)) throw new TypeError("projects must be an array");
  const discover = dependencies.discoverProjectDocuments || discoverProjectDocuments;
  const sleep = dependencies.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const delayMs = boundedDelay(options.delayMs ?? DEFAULT_DELAY_MS);
  const plans = [];
  const reports = [];
  const discoveriesByProjectId = new Map();
  const summary = createSummary(projects.length);

  for (let index = 0; index < projects.length; index += 1) {
    const project = asPlainObject(projects[index]);
    const projectId = String(project.project_id || "").trim();
    try {
      const discovery = await discover(projectId);
      discoveriesByProjectId.set(projectId, discovery);
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
      reports.push(createPlanReport(plan));
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

  return { plans, reports, summary, delayMs, discoveriesByProjectId };
}

function rateLimitedCategories(discovery) {
  const documents = asPlainObject(discovery?.documents);
  return DOCUMENT_KEYS.filter((category) => {
    const observed = asPlainObject(documents[category]);
    return (
      observed.status === "error" &&
      observed.error?.code === RATE_LIMIT_ERROR_CODE
    );
  });
}

function isRecoveredObservation(observed) {
  return Boolean(observed?.status) && observed.status !== "error";
}

async function runRateLimitPostPass(
  planned,
  projects,
  options = {},
  dependencies = {}
) {
  if (!planned || !Array.isArray(planned.plans) || !Array.isArray(planned.reports)) {
    throw new TypeError("planned enrichment result is required");
  }
  if (!Array.isArray(projects)) throw new TypeError("projects must be an array");

  const discoveries = planned.discoveriesByProjectId;
  if (!(discoveries instanceof Map)) {
    throw new TypeError("planned discoveries are required for the rate-limit post-pass");
  }

  const affected = [];
  for (const projectInput of projects) {
    const project = asPlainObject(projectInput);
    const projectId = String(project.project_id || "").trim();
    const categories = rateLimitedCategories(discoveries.get(projectId));
    if (categories.length > 0) affected.push({ project, projectId, categories });
  }

  const telemetry = {
    postPassProjects: affected.length,
    postPassCategories: affected.reduce(
      (total, item) => total + item.categories.length,
      0
    ),
    postPassRecovered: 0,
    postPassStillFailed: 0,
    postPassCooldownMs: 0,
  };
  if (affected.length === 0) return { ...planned, postPass: telemetry };

  const discover = dependencies.discoverProjectDocuments || discoverProjectDocuments;
  const sleep = dependencies.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const cooldownMs = boundedPostPassCooldown(
    options.cooldownMs ?? DEFAULT_POST_PASS_COOLDOWN_MS
  );
  telemetry.postPassCooldownMs = cooldownMs;
  if (cooldownMs > 0) await sleep(cooldownMs);

  const plans = [...planned.plans];
  const reports = [...planned.reports];
  const discoveriesByProjectId = new Map(discoveries);
  const planIndexes = new Map(plans.map((plan, index) => [plan.projectId, index]));
  const reportIndexes = new Map(
    reports.map((report, index) => [report.projectId, index])
  );

  for (const item of affected) {
    let retryDiscovery = null;
    try {
      retryDiscovery = await discover(item.projectId);
    } catch (_error) {
      // Retain the original per-category EGP_RATE_LIMITED observations below.
    }

    const originalDiscovery = discoveries.get(item.projectId);
    const mergedDiscovery = {
      ...originalDiscovery,
      documents: { ...asPlainObject(originalDiscovery?.documents) },
    };
    for (const category of item.categories) {
      const retryObservation = retryDiscovery?.documents?.[category];
      if (isRecoveredObservation(retryObservation)) {
        mergedDiscovery.documents[category] = retryObservation;
        telemetry.postPassRecovered += 1;
      } else {
        telemetry.postPassStillFailed += 1;
      }
    }

    discoveriesByProjectId.set(item.projectId, mergedDiscovery);
    const plan = buildProjectEnrichmentPlan(item.project, mergedDiscovery);
    const planIndex = planIndexes.get(item.projectId);
    const reportIndex = reportIndexes.get(item.projectId);
    if (planIndex !== undefined) plans[planIndex] = plan;
    if (reportIndex !== undefined) reports[reportIndex] = createPlanReport(plan);
  }

  return {
    ...planned,
    plans,
    reports,
    summary: summarizePlans(projects.length, plans, reports),
    discoveriesByProjectId,
    postPass: telemetry,
  };
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
  DEFAULT_POST_PASS_COOLDOWN_MS,
  MAX_DELAY_MS,
  MAX_POST_PASS_COOLDOWN_MS,
  applyDocumentEnrichmentPlans,
  boundedDelay,
  boundedPostPassCooldown,
  buildProjectEnrichmentPlan,
  planDocumentEnrichment,
  runRateLimitPostPass,
  referencesEqual,
};

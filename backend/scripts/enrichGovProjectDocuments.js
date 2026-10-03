require("dotenv").config({ quiet: true });
const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const GovProject = require("../src/models/GovProject");
const { validateProjectId } = require("../src/services/egp/egpDocumentService");
const { getLocalFilteredProjects } = require("../src/services/localProjectProvider");
const {
  applyDocumentEnrichmentPlans,
  boundedDelay,
  planDocumentEnrichment,
  referencesEqual,
} = require("../src/services/govProjectDocumentEnrichmentService");
const { DOCUMENT_KEYS } = require("../src/services/egp/documentReferencePolicy");

const APPLY_CONFIRMATION = "APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT";
const PROJECT_PROJECTION = {
  _id: 1,
  project_id: 1,
  documents: 1,
  updatedAt: 1,
};

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function positiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    source: null,
    projectId: null,
    limit: null,
    all: false,
    delayMs: 750,
    apply: false,
    confirm: null,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source") {
      options.source = requireValue(argv, index, argument);
      index += 1;
    } else if (argument === "--project-id") {
      options.projectId = requireValue(argv, index, argument);
      index += 1;
    } else if (argument === "--limit") {
      options.limit = positiveInteger(requireValue(argv, index, argument), argument);
      index += 1;
    } else if (argument === "--delay-ms") {
      options.delayMs = Number(requireValue(argv, index, argument));
      index += 1;
    } else if (argument === "--confirm") {
      options.confirm = requireValue(argv, index, argument);
      index += 1;
    } else if (argument === "--all") {
      options.all = true;
    } else if (argument === "--apply") {
      options.apply = true;
    } else if (argument === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  const hasSource = options.source !== null;
  const hasProjectId = options.projectId !== null;
  if (hasSource === hasProjectId) {
    throw new Error("Choose exactly one of --source local|mongo or --project-id");
  }
  if (hasSource && !["local", "mongo"].includes(options.source)) {
    throw new Error("--source must be local or mongo");
  }
  if (hasProjectId) options.projectId = validateProjectId(options.projectId);
  if (options.source === "mongo" && !options.limit && !options.all) {
    throw new Error("--source mongo requires --limit or explicit --all");
  }
  if (options.all && options.source !== "mongo") {
    throw new Error("--all is supported only with --source mongo");
  }
  if (options.limit && options.projectId) {
    throw new Error("--limit cannot be combined with --project-id");
  }
  boundedDelay(options.delayMs);
  if (options.apply && options.confirm !== APPLY_CONFIRMATION) {
    throw new Error(
      `Refusing writes: pass --confirm ${APPLY_CONFIRMATION} with --apply`
    );
  }
  if (!options.apply && options.confirm) {
    throw new Error("--confirm is valid only with --apply");
  }
  return options;
}

function uniqueProjectIds(projects) {
  const ids = [];
  const seen = new Set();
  for (const project of projects) {
    const id = validateProjectId(String(project?.project_id || "").trim());
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

async function resolveProjects(options, dependencies = {}) {
  const collection = dependencies.collection;
  if (!collection) throw new TypeError("collection is required");
  const localProvider = dependencies.getLocalFilteredProjects || getLocalFilteredProjects;

  if (options.source === "mongo") {
    let cursor = collection
      .find({}, { projection: PROJECT_PROJECTION })
      .sort({ project_id: 1 });
    if (options.limit) cursor = cursor.limit(options.limit);
    const projects = await cursor.toArray();
    return {
      projects,
      missingProjectIds: [],
      sourceSummary: {
        source: "mongo",
        candidates: projects.length,
        unique: projects.length,
        existing: projects.length,
        missing: 0,
      },
    };
  }

  const candidates = options.projectId
    ? [{ project_id: options.projectId }]
    : await localProvider();
  let ids = uniqueProjectIds(candidates);
  if (options.limit) ids = ids.slice(0, options.limit);
  const projects = await collection
    .find({ project_id: { $in: ids } }, { projection: PROJECT_PROJECTION })
    .toArray();
  const byId = new Map(projects.map((project) => [project.project_id, project]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  const missingProjectIds = ids.filter((id) => !byId.has(id));
  return {
    projects: ordered,
    missingProjectIds,
    sourceSummary: {
      source: options.projectId ? "explicit" : "local",
      candidates: candidates.length,
      unique: ids.length,
      existing: ordered.length,
      missing: missingProjectIds.length,
    },
  };
}

async function writeBackup(plans, dependencies = {}) {
  const fileSystem = dependencies.fs || fs;
  const backupDirectory =
    dependencies.backupDirectory || path.join(__dirname, "..", "backups");
  const timestamp = (dependencies.now ? dependencies.now() : new Date())
    .toISOString()
    .replace(/[:.]/g, "-");
  const backupPath = path.join(
    backupDirectory,
    `gov-project-document-enrichment-${timestamp}.json`
  );
  const records = plans
    .filter((plan) => plan.operation)
    .map((plan) => ({
      projectId: plan.projectId,
      priorDocuments: plan.priorDocuments,
      changedPaths: plan.changedPaths,
    }));
  await fileSystem.mkdir(backupDirectory, { recursive: true });
  await fileSystem.writeFile(
    backupPath,
    JSON.stringify({ createdAt: timestamp, records }, null, 2),
    "utf8"
  );
  return backupPath;
}

async function verifyAppliedPlans(plans, collection) {
  const results = [];
  for (const plan of plans.filter((item) => item.operation)) {
    const current = await collection.findOne(
      { project_id: plan.projectId },
      { projection: { documents: 1 } }
    );
    let verified = Boolean(current);
    for (const category of DOCUMENT_KEYS) {
      if (!referencesEqual(current?.documents?.[category], plan.effectiveDocuments[category])) {
        verified = false;
      }
    }
    if (
      (current?.documents?.selectedProcurementDocument ?? null) !==
      plan.effectiveSelection
    ) {
      verified = false;
    }
    results.push({ projectId: plan.projectId, verified });
  }
  return results;
}

async function executeApplyWithBackup(plans, dependencies = {}) {
  const pendingPlans = plans.filter((plan) => plan.operation);
  if (pendingPlans.length === 0) {
    return {
      backupPath: null,
      apply: { matched: 0, modified: 0, conflicts: 0, results: [] },
      verification: [],
    };
  }
  const backupWriter = dependencies.writeBackup || writeBackup;
  const backupPath = await backupWriter(pendingPlans, dependencies);
  const apply = await applyDocumentEnrichmentPlans(pendingPlans, {
    updateOne: dependencies.updateOne,
  });
  const successfullyMatched = pendingPlans.filter((plan) =>
    apply.results.some(
      (result) => result.projectId === plan.projectId && result.matchedCount > 0
    )
  );
  const verification = dependencies.verify
    ? await dependencies.verify(successfullyMatched)
    : [];
  return { backupPath, apply, verification };
}

async function run(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  const mongo = dependencies.mongoose || mongoose;
  const model = dependencies.GovProject || GovProject;
  const mongoUri = dependencies.mongoUri || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required");

  await mongo.connect(mongoUri);
  try {
    const resolved = await resolveProjects(options, {
      collection: model.collection,
      getLocalFilteredProjects: dependencies.getLocalFilteredProjects,
    });
    const planned = await planDocumentEnrichment(
      resolved.projects,
      { delayMs: options.delayMs },
      {
        discoverProjectDocuments: dependencies.discoverProjectDocuments,
        sleep: dependencies.sleep,
      }
    );
    let applied = null;
    if (options.apply) {
      applied = await executeApplyWithBackup(planned.plans, {
        backupDirectory: dependencies.backupDirectory,
        now: dependencies.now,
        fs: dependencies.fs,
        updateOne: (filter, update, writeOptions) =>
          model.collection.updateOne(filter, update, writeOptions),
        verify: (plans) => verifyAppliedPlans(plans, model.collection),
      });
    }

    const output = {
      mode: options.apply ? "apply" : "dry-run",
      source: resolved.sourceSummary,
      missingProjectIds: resolved.missingProjectIds,
      delayMs: planned.delayMs,
      summary: {
        ...planned.summary,
        ...(applied
          ? {
              matched: applied.apply.matched,
              modified: applied.apply.modified,
              conflicts: applied.apply.conflicts,
            }
          : {}),
      },
      projects: planned.reports,
      backupPath: applied?.backupPath || null,
      verification: applied?.verification || [],
    };
    output.projects.push(
      ...resolved.missingProjectIds.map((projectId) => ({
        projectId,
        outcome: "missing",
        categories: null,
        changedPaths: [],
      }))
    );
    console.log(JSON.stringify(output, null, 2));
    if (applied?.apply.conflicts > 0) {
      throw new Error(
        `Document enrichment had ${applied.apply.conflicts} optimistic concurrency conflict(s)`
      );
    }
    if (applied?.verification.some((item) => !item.verified)) {
      throw new Error("Post-write document verification failed");
    }
    return output;
  } finally {
    await mongo.disconnect();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  APPLY_CONFIRMATION,
  PROJECT_PROJECTION,
  executeApplyWithBackup,
  parseArgs,
  resolveProjects,
  run,
  uniqueProjectIds,
  verifyAppliedPlans,
  writeBackup,
};

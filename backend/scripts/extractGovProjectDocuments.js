// CLI entry point: reads saved document references from MongoDB and
// plans or runs local ZIP-to-PDF extraction. MongoDB is read-only here, and
// apply mode requires explicit confirmation before downloads or file writes.
require("dotenv").config({ quiet: true });
const path = require("node:path");
const mongoose = require("mongoose");
const GovProject = require("../src/models/GovProject");
const { validateProjectId } = require("../src/services/egp/egpClient");
const {
  planDocumentExtractionBatch,
  processProjectDocumentExtractions,
} = require("../src/services/govProjectDocumentExtractionService");

const APPLY_CONFIRMATION = "EXTRACT_GOV_PROJECT_DOCUMENTS";
const DEFAULT_DELAY_MS = 750;
const MAX_DELAY_MS = 5_000;
const PROJECT_PROJECTION = {
  _id: 1,
  project_id: 1,
  documents: 1,
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

function boundedDelay(value = DEFAULT_DELAY_MS) {
  const delay = Number(value);
  if (!Number.isInteger(delay) || delay < 0 || delay > MAX_DELAY_MS) {
    throw new Error(`--delay-ms must be an integer from 0 to ${MAX_DELAY_MS}`);
  }
  return delay;
}

function createDownloadThrottle(delayMs, dependencies = {}) {
  const delay = boundedDelay(delayMs);
  const sleep =
    dependencies.sleep ||
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let downloadStarted = false;

  return async function beforeDownload() {
    if (downloadStarted && delay > 0) await sleep(delay);
    downloadStarted = true;
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    source: null,
    projectId: null,
    limit: null,
    all: false,
    apply: false,
    confirm: null,
    force: false,
    redownload: false,
    delayMs: DEFAULT_DELAY_MS,
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
      options.limit = positiveInteger(
        requireValue(argv, index, argument),
        argument
      );
      index += 1;
    } else if (argument === "--confirm") {
      options.confirm = requireValue(argv, index, argument);
      index += 1;
    } else if (argument === "--delay-ms") {
      options.delayMs = boundedDelay(requireValue(argv, index, argument));
      index += 1;
    } else if (argument === "--all") {
      options.all = true;
    } else if (argument === "--apply") {
      options.apply = true;
    } else if (argument === "--force") {
      options.force = true;
    } else if (argument === "--redownload") {
      options.redownload = true;
    } else if (argument === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  const hasSource = options.source !== null;
  const hasProjectId = options.projectId !== null;
  if (hasSource === hasProjectId) {
    throw new Error("Choose exactly one of --source mongo or --project-id");
  }
  if (hasSource && options.source !== "mongo") {
    throw new Error("--source must be mongo");
  }
  if (hasProjectId) options.projectId = validateProjectId(options.projectId);
  if (options.source === "mongo" && !options.limit && !options.all) {
    throw new Error("--source mongo requires --limit or explicit --all");
  }
  if (options.all && options.source !== "mongo") {
    throw new Error("--all is supported only with --source mongo");
  }
  if (options.limit && options.source !== "mongo") {
    throw new Error("--limit is supported only with --source mongo");
  }
  if (options.limit && options.all) {
    throw new Error("Choose either --limit or --all, not both");
  }
  if (options.apply && options.confirm !== APPLY_CONFIRMATION) {
    throw new Error(
      `Refusing downloads and writes: pass --confirm ${APPLY_CONFIRMATION} with --apply`
    );
  }
  if (!options.apply && options.confirm) {
    throw new Error("--confirm is valid only with --apply");
  }
  options.delayMs = boundedDelay(options.delayMs);

  return options;
}

function createDryRunReport(projects, options = {}) {
  if (options.apply) {
    throw new Error("Apply execution is not available in the planning stage");
  }
  const planned = planDocumentExtractionBatch(projects);
  return {
    mode: "dry-run",
    selection: {
      source: options.source,
      projectId: options.projectId,
      limit: options.limit,
      all: options.all === true,
    },
    options: {
      force: options.force === true,
      redownload: options.redownload === true,
      delayMs: boundedDelay(options.delayMs),
    },
    summary: planned.summary,
    projects: planned.reports,
  };
}

async function resolveProjects(options, dependencies = {}) {
  const collection = dependencies.collection;
  if (!collection) throw new TypeError("collection is required");

  if (options.projectId) {
    const project = await collection.findOne(
      { project_id: options.projectId },
      { projection: PROJECT_PROJECTION }
    );
    return {
      projects: project ? [project] : [],
      missingProjectIds: project ? [] : [options.projectId],
      sourceSummary: {
        source: "explicit",
        requested: 1,
        existing: project ? 1 : 0,
        missing: project ? 0 : 1,
      },
    };
  }

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
      requested: options.all ? "all" : options.limit,
      existing: projects.length,
      missing: 0,
    },
  };
}

function createApplySummary(totalProjects) {
  return {
    projects: totalProjects,
    processedProjects: 0,
    failedProjects: 0,
    extractedCategories: 0,
    skippedCategories: 0,
    failedCategories: 0,
  };
}

async function executeProjects(projects, options, dependencies = {}) {
  const processProject =
    dependencies.processProjectDocumentExtractions ||
    processProjectDocumentExtractions;
  const reports = [];
  const summary = createApplySummary(projects.length);

  for (const project of projects) {
    const projectId = String(project?.project_id || "").trim() || null;
    try {
      const report = await processProject(
        project,
        {
          tempRoot: options.tempRoot,
          force: options.force,
          redownload: options.redownload,
        },
        dependencies
      );
      reports.push(report);
      summary.processedProjects += 1;
      summary.extractedCategories += Number(report?.summary?.extracted || 0);
      summary.skippedCategories += Number(report?.summary?.skipped || 0);
      summary.failedCategories += Number(report?.summary?.failed || 0);
    } catch (error) {
      summary.failedProjects += 1;
      reports.push({
        projectId,
        outcome: "failed",
        error: {
          code: error?.code || "PROJECT_DOCUMENT_EXTRACTION_FAILED",
          message: String(error?.message || "Project extraction failed").slice(
            0,
            500
          ),
        },
      });
    }
  }
  return { reports, summary };
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
    });
    let output;
    if (!options.apply) {
      output = {
        ...createDryRunReport(resolved.projects, options),
        source: resolved.sourceSummary,
        missingProjectIds: resolved.missingProjectIds,
      };
      output.projects.push(
        ...resolved.missingProjectIds.map((projectId) => ({
          projectId,
          outcome: "missing",
        }))
      );
    } else {
      const tempRoot =
        dependencies.tempRoot || path.join(__dirname, "..", "temp");
      const beforeDownload =
        dependencies.beforeDownload ||
        createDownloadThrottle(options.delayMs, {
          sleep: dependencies.sleep,
        });
      const executed = await executeProjects(
        resolved.projects,
        { ...options, tempRoot },
        { ...dependencies, beforeDownload }
      );
      executed.summary.failedProjects += resolved.missingProjectIds.length;
      output = {
        mode: "apply",
        source: resolved.sourceSummary,
        missingProjectIds: resolved.missingProjectIds,
        options: {
          force: options.force,
          redownload: options.redownload,
          delayMs: options.delayMs,
        },
        tempRoot,
        summary: executed.summary,
        projects: [
          ...executed.reports,
          ...resolved.missingProjectIds.map((projectId) => ({
            projectId,
            outcome: "missing",
          })),
        ],
      };
    }

    output.exitCode =
      output.mode === "apply" &&
      (output.summary.failedProjects > 0 ||
        output.summary.failedCategories > 0)
        ? 1
        : 0;
    const log = dependencies.log || console.log;
    log(JSON.stringify(output, null, 2));
    return output;
  } finally {
    await mongo.disconnect();
  }
}

if (require.main === module) {
  run()
    .then((output) => {
      if (output.exitCode) process.exitCode = output.exitCode;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  APPLY_CONFIRMATION,
  DEFAULT_DELAY_MS,
  MAX_DELAY_MS,
  PROJECT_PROJECTION,
  boundedDelay,
  createDryRunReport,
  createDownloadThrottle,
  executeProjects,
  parseArgs,
  resolveProjects,
  run,
};

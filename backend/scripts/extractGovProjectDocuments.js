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
const DEFAULT_MAX_DOWNLOAD_MB = 150;
const MAX_DOWNLOAD_MB = 250;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const MAX_DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
const BYTES_PER_MB = 1024 * 1024;
const PROJECT_PROJECTION = {
  _id: 1,
  project_id: 1,
  documents: 1,
};

/**
 * Read the value after a CLI flag; reject missing values or another flag in its place.
 */
function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

/**
 * Convert a CLI value into a positive integer or report which flag is invalid.
 */
function positiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

/**
 * Validate the delay between downloads against the supported range.
 */
function boundedDelay(value = DEFAULT_DELAY_MS) {
  const delay = Number(value);
  if (!Number.isInteger(delay) || delay < 0 || delay > MAX_DELAY_MS) {
    throw new Error(`--delay-ms must be an integer from 0 to ${MAX_DELAY_MS}`);
  }
  return delay;
}

/**
 * Validate the archive download limit in megabytes.
 */
function boundedMaxDownloadMb(value = DEFAULT_MAX_DOWNLOAD_MB) {
  const maxDownloadMb = Number(value);
  if (
    !Number.isInteger(maxDownloadMb) ||
    maxDownloadMb < 1 ||
    maxDownloadMb > MAX_DOWNLOAD_MB
  ) {
    throw new Error(
      `--max-download-mb must be an integer from 1 to ${MAX_DOWNLOAD_MB}`
    );
  }
  return maxDownloadMb;
}

/**
 * Validate the per-request download timeout in milliseconds.
 */
function boundedDownloadTimeoutMs(value = DEFAULT_DOWNLOAD_TIMEOUT_MS) {
  const timeoutMs = Number(value);
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > MAX_DOWNLOAD_TIMEOUT_MS
  ) {
    throw new Error(
      `--download-timeout-ms must be an integer from 1000 to ${MAX_DOWNLOAD_TIMEOUT_MS}`
    );
  }
  return timeoutMs;
}

/**
 * Return a shared hook that delays each download after the first across this run.
 */
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

/**
 * Parse project selection and extraction options. Default to planning; require the
 * explicit confirmation string for downloads/file writes.
 */
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
    maxDownloadMb: DEFAULT_MAX_DOWNLOAD_MB,
    downloadTimeoutMs: DEFAULT_DOWNLOAD_TIMEOUT_MS,
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
    } else if (argument === "--max-download-mb") {
      options.maxDownloadMb = boundedMaxDownloadMb(
        requireValue(argv, index, argument)
      );
      index += 1;
    } else if (argument === "--download-timeout-ms") {
      options.downloadTimeoutMs = boundedDownloadTimeoutMs(
        requireValue(argv, index, argument)
      );
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
  options.maxDownloadMb = boundedMaxDownloadMb(options.maxDownloadMb);
  options.downloadTimeoutMs = boundedDownloadTimeoutMs(
    options.downloadTimeoutMs
  );

  return options;
}

/**
 * Describe which stored references would be extracted, with no downloads or extraction
 * writes.
 */
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
      maxDownloadMb: boundedMaxDownloadMb(options.maxDownloadMb),
      downloadTimeoutMs: boundedDownloadTimeoutMs(options.downloadTimeoutMs),
    },
    summary: planned.summary,
    projects: planned.reports,
  };
}

/**
 * Read selected projects and document references from MongoDB, reporting a missing
 * explicit project separately.
 */
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

/**
 * Initialize project/category outcome counts for an extraction run.
 */
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

/**
 * Run extraction sequentially with download size/time limits; isolate project failures and
 * aggregate category results.
 */
async function executeProjects(projects, options, dependencies = {}) {
  const processProject =
    dependencies.processProjectDocumentExtractions ||
    processProjectDocumentExtractions;
  const reports = [];
  const summary = createApplySummary(projects.length);
  const maxDownloadMb = boundedMaxDownloadMb(options.maxDownloadMb);
  const downloadTimeoutMs = boundedDownloadTimeoutMs(
    options.downloadTimeoutMs
  );
  const processDependencies = {
    ...dependencies,
    downloadOptions: {
      ...(dependencies.downloadOptions || {}),
      maxBytes: maxDownloadMb * BYTES_PER_MB,
      timeoutMs: downloadTimeoutMs,
    },
  };

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
        processDependencies
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

/**
 * Connect to MongoDB, select records, then plan or execute ZIP-to-PDF extraction and print
 * a report. Disconnect in finally; MongoDB records are not updated here.
 */
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
          maxDownloadMb: options.maxDownloadMb,
          downloadTimeoutMs: options.downloadTimeoutMs,
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
  BYTES_PER_MB,
  DEFAULT_DELAY_MS,
  DEFAULT_DOWNLOAD_TIMEOUT_MS,
  DEFAULT_MAX_DOWNLOAD_MB,
  MAX_DELAY_MS,
  MAX_DOWNLOAD_TIMEOUT_MS,
  MAX_DOWNLOAD_MB,
  PROJECT_PROJECTION,
  boundedDelay,
  boundedDownloadTimeoutMs,
  boundedMaxDownloadMb,
  createDryRunReport,
  createDownloadThrottle,
  executeProjects,
  parseArgs,
  resolveProjects,
  run,
};

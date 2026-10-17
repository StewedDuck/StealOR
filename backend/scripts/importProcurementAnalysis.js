require("dotenv").config({ quiet: true });

const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const GovProject = require("../src/models/GovProject");
const {
  applyImportPlans,
  buildImportPlan,
  buildRollbackPlans,
  canonicallyEqual,
  verifyImportPlans,
} = require("../src/services/procurementAnalysis/mongoImportService");

const APPLY_CONFIRMATION = "APPLY_PROCUREMENT_ANALYSIS_IMPORT";
const ROLLBACK_CONFIRMATION = "ROLLBACK_PROCUREMENT_ANALYSIS_IMPORT";
const PROJECT_PROJECTION = { _id: 1, project_id: 1, documents: 1, procurementAnalysis: 1, updatedAt: 1 };

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    inputRoot: path.resolve(__dirname, "../temp/procurement-analysis"),
    projectId: null,
    all: false,
    limit: null,
    apply: false,
    confirm: null,
    verify: false,
    rollback: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--input-root") { options.inputRoot = path.resolve(requireValue(argv, index, argument)); index += 1; }
    else if (argument === "--project-id") { options.projectId = requireValue(argv, index, argument); index += 1; }
    else if (argument === "--limit") { options.limit = Number(requireValue(argv, index, argument)); index += 1; }
    else if (argument === "--confirm") { options.confirm = requireValue(argv, index, argument); index += 1; }
    else if (argument === "--rollback") { options.rollback = path.resolve(requireValue(argv, index, argument)); index += 1; }
    else if (argument === "--all") options.all = true;
    else if (argument === "--apply") options.apply = true;
    else if (argument === "--verify") options.verify = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.help) return options;
  if (options.rollback) {
    if (!options.apply || options.confirm !== ROLLBACK_CONFIRMATION) {
      throw new Error(`Refusing rollback: pass --apply --confirm ${ROLLBACK_CONFIRMATION}`);
    }
    if (options.projectId || options.all || options.verify) throw new Error("--rollback cannot be combined with selection or --verify");
    return options;
  }
  if (Boolean(options.projectId) === Boolean(options.all)) throw new Error("Choose exactly one of --project-id or --all");
  if (options.projectId && !/^\d{11}$/.test(options.projectId)) throw new Error("--project-id must contain exactly 11 digits");
  if (options.limit != null && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error("--limit must be a positive integer");
  if (options.limit && options.projectId) throw new Error("--limit cannot be combined with --project-id");
  if (options.apply && options.verify) throw new Error("--apply and --verify are separate modes");
  if (options.apply && options.confirm !== APPLY_CONFIRMATION) {
    throw new Error(`Refusing writes: pass --confirm ${APPLY_CONFIRMATION} with --apply`);
  }
  if (!options.apply && options.confirm) throw new Error("--confirm is valid only with --apply");
  return options;
}

function helpText() {
  return [
    "Usage: node scripts/importProcurementAnalysis.js (--project-id ID | --all) [options]",
    "",
    "  --input-root PATH      Local schema-v3 analysis output root",
    "  --project-id ID        Import/verify one project",
    "  --all                  Select all local analysis directories",
    "  --limit N              Bound an --all dry run",
    "  --verify               Read-only comparison with stored data",
    "  --apply                Enable writes (dry-run is the default)",
    `  --confirm ${APPLY_CONFIRMATION}`,
    "                         Required exact token for import writes",
    "  --rollback FILE        Guarded rollback from an importer backup",
    `  --confirm ${ROLLBACK_CONFIRMATION}`,
    "                         Required exact token for rollback writes",
    "  --help, -h             Show help without connecting to MongoDB",
  ].join("\n");
}

async function discoverAnalysisIds(inputRoot, dependencies = {}) {
  const io = dependencies.fs || fs;
  const entries = await io.readdir(inputRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && /^\d{11}$/.test(entry.name)).map((entry) => entry.name).sort();
}

async function loadLocalAnalyses(options, dependencies = {}) {
  const io = dependencies.fs || fs;
  let ids = options.projectId ? [options.projectId] : await discoverAnalysisIds(options.inputRoot, dependencies);
  if (options.limit) ids = ids.slice(0, options.limit);
  const items = [];
  for (const projectId of ids) {
    const analysisPath = path.join(options.inputRoot, projectId, "analysis.json");
    try {
      items.push({ projectId, analysisPath, analysis: JSON.parse(await io.readFile(analysisPath, "utf8")) });
    } catch (error) {
      items.push({ projectId, analysisPath, analysis: null, readError: error.message });
    }
  }
  return items;
}

async function writeBackup(plans, dependencies = {}) {
  const io = dependencies.fs || fs;
  const backupDirectory = dependencies.backupDirectory || path.resolve(__dirname, "../backups");
  const createdAt = (dependencies.now ? dependencies.now() : new Date()).toISOString();
  const backupPath = path.join(backupDirectory, `procurement-analysis-${createdAt.replace(/[:.]/g, "-")}.json`);
  const backup = {
    type: "procurement-analysis-backup",
    schemaVersion: 1,
    createdAt,
    records: plans.map((plan) => ({
      projectId: plan.projectId,
      hadPriorAnalysis: plan.hadPriorAnalysis,
      priorAnalysis: plan.priorAnalysis,
      importedAnalysis: plan.importedAnalysis,
    })),
  };
  await io.mkdir(backupDirectory, { recursive: true });
  await io.writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return backupPath;
}

async function findProjects(collection, projectIds) {
  if (!projectIds.length) return [];
  return collection.find({ project_id: { $in: projectIds } }, { projection: PROJECT_PROJECTION }).toArray();
}

async function runRollback(options, collection, dependencies = {}) {
  const io = dependencies.fs || fs;
  const backup = JSON.parse(await io.readFile(options.rollback, "utf8"));
  const ids = Array.isArray(backup.records) ? backup.records.map((record) => record.projectId) : [];
  const projects = await findProjects(collection, ids);
  const rollback = buildRollbackPlans(backup, projects);
  const results = await applyImportPlans(rollback.plans, (filter, update, writeOptions) => collection.updateOne(filter, update, writeOptions));
  const verification = [];
  for (const plan of rollback.plans.filter((candidate) => results.some((result) => result.projectId === candidate.projectId && result.matchedCount === 1 && !result.error))) {
    const current = await collection.findOne({ project_id: plan.projectId }, { projection: { procurementAnalysis: 1 } });
    const hasField = Boolean(current && Object.prototype.hasOwnProperty.call(current, "procurementAnalysis"));
    verification.push({ projectId: plan.projectId, verified: plan.expectsField ? hasField && canonicallyEqual(current.procurementAnalysis, plan.expectedAfter) : Boolean(current) && !hasField });
  }
  if (results.some((result) => result.conflict || result.error) || verification.some((item) => !item.verified)) {
    throw new Error("Guarded rollback or read-back verification failed");
  }
  return { mode: "rollback", backupPath: options.rollback, reports: rollback.reports, results, verification };
}

async function run(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  const logger = dependencies.logger || console.log;
  if (options.help) { logger(helpText()); return { mode: "help" }; }
  const mongo = dependencies.mongoose || mongoose;
  const model = dependencies.GovProject || GovProject;
  const mongoUri = dependencies.mongoUri || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required");
  await mongo.connect(mongoUri);
  try {
    if (options.rollback) {
      const output = await runRollback(options, model.collection, dependencies);
      logger(JSON.stringify(output, null, 2));
      return output;
    }
    const localAnalyses = await loadLocalAnalyses(options, dependencies);
    const projectIds = [...new Set(localAnalyses.map((item) => item.analysis?.projectId || item.projectId).filter((id) => /^\d{11}$/.test(id)))];
    const projects = await findProjects(model.collection, projectIds);
    const plan = buildImportPlan(localAnalyses, projects);
    let backupPath = null;
    let applyResults = [];
    let verification = [];
    if (options.verify) {
      verification = localAnalyses.map((item) => {
        const project = projects.find((candidate) => candidate.project_id === item.projectId);
        const planned = plan.plans.find((candidate) => candidate.projectId === item.projectId);
        return { projectId: item.projectId, verified: Boolean(project && !planned && plan.reports.some((report) => report.projectId === item.projectId && report.outcome === "unchanged")) };
      });
    } else if (options.apply && plan.plans.length) {
      backupPath = await (dependencies.writeBackup || writeBackup)(plan.plans, dependencies);
      applyResults = await applyImportPlans(plan.plans, (filter, update, writeOptions) => model.collection.updateOne(filter, update, writeOptions));
      const matchedPlans = plan.plans.filter((candidate) => applyResults.some((result) => result.projectId === candidate.projectId && result.matchedCount === 1 && !result.error));
      verification = await verifyImportPlans(matchedPlans, (filter, findOptions) => model.collection.findOne(filter, findOptions));
    }
    const output = { mode: options.verify ? "verify" : options.apply ? "apply" : "dry-run", summary: plan.summary, reports: plan.reports, duplicateLocalProjectIds: plan.duplicateLocalProjectIds, duplicateDatabaseProjectIds: plan.duplicateDatabaseProjectIds, backupPath, applyResults, verification };
    logger(JSON.stringify(output, null, 2));
    if (applyResults.some((result) => result.conflict || result.error)) throw new Error("One or more guarded MongoDB updates failed");
    if (verification.some((result) => !result.verified)) throw new Error("MongoDB read-back verification failed");
    return output;
  } finally {
    await mongo.disconnect();
  }
}

if (require.main === module) {
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = {
  APPLY_CONFIRMATION,
  PROJECT_PROJECTION,
  ROLLBACK_CONFIRMATION,
  discoverAnalysisIds,
  helpText,
  loadLocalAnalyses,
  parseArgs,
  run,
  runRollback,
  writeBackup,
};

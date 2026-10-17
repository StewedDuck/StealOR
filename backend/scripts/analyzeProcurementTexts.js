/**
 * CLI สำหรับวิเคราะห์เอกสารจัดซื้อจัดจ้างที่ถูก extract เป็น TXT แล้ว
 *
 * หน้าที่ของไฟล์นี้มีเฉพาะการรับ command-line options และประสานงาน service ต่าง ๆ:
 * 1. อ่าน manifest/TXT ผ่าน localInputAdapter
 * 2. ตรวจ cache ด้วย fingerprint
 * 3. เรียก analysisService เพื่อวิเคราะห์เอกสาร
 * 4. บันทึก analysis.json และ summary.md
 *
 * Business rules, Gemini prompt และกฎตรวจสอบหลักฐานไม่ได้อยู่ในไฟล์นี้
 * เพื่อให้ analysisService สามารถนำไปใช้กับ MongoDB หรือ in-memory documents ได้ในอนาคต
 */
require("dotenv").config({ quiet: true });

const fs = require("node:fs/promises");
const path = require("node:path");
const { getVertexConfig } = require("../src/config/vertex");
const { formatVertexError } = require("../src/services/vertexAIService");
const {
  analyzeProcurementInput,
  computeAnalysisFingerprint,
} = require("../src/services/procurementAnalysis/analysisService");
const {
  discoverLocalProjectIds,
  loadReusableResult,
  readLocalProjectInput,
  saveProjectOutputs,
} = require("../src/services/procurementAnalysis/localInputAdapter");
const { formatReadableSummary } = require("../src/services/procurementAnalysis/reportWriter");
const { validateLocalAnalysisOutputs } = require("../src/services/procurementAnalysis/analysisValidation");
const {
  DEFAULT_REQUEST_DELAY_MS,
  createVertexRequestScheduler,
} = require("../src/services/procurementAnalysis/vertexAnalyzer");

function parseCliArgs(argv) {
  const args = {
    projectIds: [],
    inputRoot: path.resolve(__dirname, "../temp/pdfs"),
    outputRoot: path.resolve(__dirname, "../temp/procurement-analysis"),
    limit: null,
    force: false,
    allLocal: false,
    help: false,
    discoverOnly: false,
    validateOnly: false,
    timings: false,
    delayMs: DEFAULT_REQUEST_DELAY_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--help" || name === "-h") args.help = true;
    else if (name === "--project-id") args.projectIds.push(argv[++index]);
    else if (name === "--all" || name === "--all-local") args.allLocal = true;
    else if (name === "--input-root") args.inputRoot = path.resolve(argv[++index]);
    else if (name === "--output-root") args.outputRoot = path.resolve(argv[++index]);
    else if (name === "--limit") args.limit = Number(argv[++index]);
    else if (name === "--delay-ms") args.delayMs = Number(argv[++index]);
    else if (name === "--force") args.force = true;
    else if (name === "--discover-only") args.discoverOnly = true;
    else if (name === "--validate-only") args.validateOnly = true;
    else if (name === "--timings") args.timings = true;
    else throw new Error(`Unknown argument: ${name}`);
  }
  if (args.help) return args;
  if (args.allLocal && args.projectIds.length) throw new Error("--all-local cannot be combined with --project-id.");
  if (!args.allLocal && !args.projectIds.length) args.projectIds.push("67049068372");
  for (const projectId of args.projectIds) if (!/^\d{11}$/.test(String(projectId))) throw new Error(`Invalid project ID: ${projectId}`);
  if (args.limit != null && (!Number.isInteger(args.limit) || args.limit < 1)) throw new Error("--limit must be a positive integer.");
  if (!Number.isInteger(args.delayMs) || args.delayMs < 0 || args.delayMs > 5_000) {
    throw new Error("--delay-ms must be an integer between 0 and 5000.");
  }
  args.projectIds = [...new Set(args.projectIds)];
  if (!args.allLocal) args.projectIds = args.projectIds.slice(0, args.limit || undefined);
  return args;
}

function helpText() {
  return [
    "Usage: node scripts/analyzeProcurementTexts.js [options]",
    "",
    "Selection:",
    "  --project-id ID       Analyze one 11-digit project ID (repeatable)",
    "  --all                 Discover projects from local extraction manifests",
    "  --all-local           Backward-compatible alias for --all",
    "  --limit N             Process only the first N selected projects",
    "",
    "Paths and modes:",
    "  --input-root PATH      Manifest/TXT root (default: temp/pdfs)",
    "  --output-root PATH     Output root (default: temp/procurement-analysis)",
    "  --discover-only        List discovered project IDs; make no Vertex requests",
    "  --validate-only        Validate existing analysis.json files for MongoDB import",
    "  --force                Explicitly replace existing project outputs",
    "  --delay-ms N           Delay between sequential Vertex requests (0-5000)",
    "  --timings              Show per-document request timing diagnostics",
    "  --help, -h             Show this help without initializing Vertex AI or MongoDB",
  ].join("\n");
}

function formatTokenUsage(tokenUsage) {
  if (!tokenUsage) return "tokens unavailable";
  const input = tokenUsage.inputTokens == null ? "?" : tokenUsage.inputTokens;
  const output = tokenUsage.outputTokens == null ? "?" : tokenUsage.outputTokens;
  const total = tokenUsage.totalTokens == null ? "?" : tokenUsage.totalTokens;
  return `tokens input=${input} output=${output} total=${total}`;
}

function formatAnalysisProgress(progress) {
  const identity = `${progress.documentName || progress.documentId} (${progress.archiveCategory || "unknown"})`;
  if (progress.phase === "completed") {
    return [
      `Vertex: [${progress.request}/${progress.totalRequests}] ${identity}`,
      `${progress.outcome.toUpperCase()} latency=${progress.geminiApiLatencyMs}ms`,
      `start=${progress.requestStartedAt}`,
      `end=${progress.requestCompletedAt}`,
      formatTokenUsage(progress.tokenUsage),
    ].join(" ");
  }
  return `Vertex: [${progress.request}/${progress.totalRequests}] ${identity} QUEUED`;
}

async function runProject(projectId, args, dependencies = {}) {
  const config = dependencies.config || getVertexConfig();
  const input = await readLocalProjectInput({ projectId, inputRoot: args.inputRoot }, dependencies);
  const fingerprint = computeAnalysisFingerprint(input, config);
  const outputDirectory = path.join(args.outputRoot, projectId);
  const jsonPath = path.join(outputDirectory, "analysis.json");
  if (!args.force) {
    const cached = await loadReusableResult(jsonPath, fingerprint, dependencies);
    if (cached) {
      const summaryPath = path.join(outputDirectory, "summary.md");
      try {
        await (dependencies.fs || fs).access(summaryPath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        await (dependencies.fs || fs).writeFile(summaryPath, formatReadableSummary(cached), { encoding: "utf8", flag: "wx" });
      }
      const paths = { jsonPath, summaryPath };
      return { projectId, input, result: cached, outputPaths: paths, cached: true };
    }
    for (const outputPath of [jsonPath, path.join(outputDirectory, "summary.md")]) {
      try {
        await (dependencies.fs || fs).access(outputPath);
        throw new Error(`Output already exists in ${outputDirectory}; pass --force to replace stale output.`);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  const result = await analyzeProcurementInput(input, {
    config,
    client: dependencies.client,
    beforeVertexRequest: dependencies.requestScheduler && (() => dependencies.requestScheduler.beforeRequest()),
    now: dependencies.analysisNow,
    onProgress: dependencies.onProgress || (args.timings ? ((progress) => console.log(formatAnalysisProgress(progress))) : undefined),
  });
  const outputPaths = await saveProjectOutputs(result, outputDirectory, { ...dependencies, overwrite: args.force });
  return { projectId, input, result, outputPaths, cached: false };
}

async function writeValidationReport(report, outputRoot, dependencies = {}) {
  const io = dependencies.fs || fs;
  await io.mkdir(outputRoot, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const reportPath = path.join(outputRoot, `validation-report-${stamp}.json`);
  await io.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return reportPath;
}

function logValidationSummary(report, logger) {
  logger("LOCAL VALIDATION");
  logger(`Analyses checked: ${report.summary.total}`);
  logger(`Suitable for MongoDB import: ${report.summary.suitable}`);
  logger(`Unsuitable: ${report.summary.unsuitable}`);
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseCliArgs(argv);
  const logger = dependencies.logger || console.log;
  if (args.help) {
    logger(helpText());
    return { mode: "help" };
  }
  const now = dependencies.now || Date.now;
  const startedAt = now();
  let discoveredProjectCount = null;
  if (args.allLocal) {
    args.projectIds = await discoverLocalProjectIds(args.inputRoot, dependencies);
    discoveredProjectCount = args.projectIds.length;
    logger(`Discovered local projects: ${discoveredProjectCount}`);
    args.projectIds = args.projectIds.slice(0, args.limit || undefined);
  }
  if (args.discoverOnly) {
    if (!args.allLocal) throw new Error("--discover-only requires --all.");
    for (const projectId of args.projectIds) logger(projectId);
    return { mode: "discovery", discovered: discoveredProjectCount, selected: args.projectIds.length, projectIds: args.projectIds };
  }
  if (args.validateOnly) {
    const report = await validateLocalAnalysisOutputs(args.outputRoot, { projectIds: args.allLocal ? args.projectIds : args.projectIds }, dependencies);
    logValidationSummary(report, logger);
    const reportPath = await writeValidationReport(report, args.outputRoot, dependencies);
    logger(`Validation report: ${reportPath}`);
    return { mode: "validation", report, reportPath };
  }
  // scheduler ตัวเดียวถูกส่งให้ทุก project เพื่อให้ delay ไม่ reset ระหว่าง project
  const requestScheduler = dependencies.requestScheduler || createVertexRequestScheduler({
    delayMs: args.delayMs,
    sleep: dependencies.sleep,
  });
  const runDependencies = { ...dependencies, requestScheduler };
  const runs = [];
  for (const [index, projectId] of args.projectIds.entries()) {
    logger(`[${index + 1}/${args.projectIds.length}] Project ${projectId}: START`);
    try {
      const run = await runProject(projectId, args, runDependencies);
      runs.push(run);
      logger(`[${index + 1}/${args.projectIds.length}] Project ${projectId}: ${String(run.result.status).toUpperCase()} (cache ${run.cached ? "HIT" : "MISS"})`);
    } catch (error) {
      runs.push({ projectId, error: error.message });
      (dependencies.errorLogger || console.error)(`Project ${projectId} failed: ${error.message}`);
      logger(`[${index + 1}/${args.projectIds.length}] Project ${projectId}: FAILED`);
    }
  }
  const hasSource = (run) => run.input && run.input.documents.length > 0;
  const completed = runs.filter((run) => hasSource(run) && run.result && run.result.status === "complete").length;
  const incomplete = runs.filter((run) => hasSource(run) && run.result && run.result.status === "incomplete").length;
  const failed = runs.filter((run) => !run.result || run.result.status === "error").length;
  const missingSource = runs.filter((run) => run.input && run.input.documents.length === 0).length;
  const cacheHits = runs.filter((run) => run.cached).length;
  const actualRequests = typeof requestScheduler.getRequestCount === "function" ? requestScheduler.getRequestCount() : 0;
  const elapsedMs = Math.max(0, now() - startedAt);
  logger("BATCH SUMMARY");
  logger(`Total projects: ${args.projectIds.length}`);
  logger(`Completed: ${completed}`);
  logger(`Incomplete: ${incomplete}`);
  logger(`Failed: ${failed}`);
  logger(`Missing source: ${missingSource}`);
  logger(`Cache hits: ${cacheHits}`);
  logger(`Actual Vertex API requests: ${actualRequests}`);
  logger(`Total elapsed time: ${elapsedMs} ms`);
  const validationReport = await validateLocalAnalysisOutputs(args.outputRoot, { projectIds: args.projectIds }, { ...dependencies, now });
  logValidationSummary(validationReport, logger);
  const validationReportPath = await writeValidationReport(validationReport, args.outputRoot, dependencies);
  logger(`Validation report: ${validationReportPath}`);
  runs.summary = { total: args.projectIds.length, completed, incomplete, failed, missingSource, cacheHits, vertexRequests: actualRequests, elapsedMs };
  runs.validationReport = validationReport;
  runs.validationReportPath = validationReportPath;
  return runs;
}

if (require.main === module) {
  main().catch((error) => {
    let message = error && error.message ? error.message : String(error);
    try { message = formatVertexError(error, getVertexConfig()); } catch {}
    console.error(message);
    process.exitCode = 1;
  });
}

module.exports = {
  formatAnalysisProgress,
  formatTokenUsage,
  helpText,
  main,
  parseCliArgs,
  runProject,
  writeValidationReport,
};

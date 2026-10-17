require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const GovProject = require("../src/models/GovProject");
const { validateProjectId, nationalEgpAdapter } = require("../src/services/egp/egpClient");
const { planDraftDeadlineBackfill } = require("../src/services/govProjectDraftDeadlineBackfillService");
const { isUsableDocumentReference } = require("../src/services/egp/documentReferencePolicy");

const APPLY_CONFIRMATION = "APPLY_DRAFT_COMMENT_DEADLINE_BACKFILL";

function parseArgs(argv = process.argv.slice(2)) {
  const options = { projectId: null, afterProjectId: null, limit: null, all: false,
    apply: false, confirm: null, delayMs: 2000, draftOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project-id") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("--project-id requires a value");
      options.projectId = argv[++i];
    } else if (arg === "--after-project-id") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("--after-project-id requires a value");
      options.afterProjectId = argv[++i];
    } else if (arg === "--limit") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("--limit requires a value");
      options.limit = Number(argv[++i]);
    } else if (arg === "--delay-ms") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("--delay-ms requires a value");
      options.delayMs = Number(argv[++i]);
    }
    else if (arg === "--all") options.all = true;
    else if (arg === "--draft-only") options.draftOnly = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--confirm") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("--confirm requires a value");
      options.confirm = argv[++i];
    }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (Number(options.projectId !== null) + Number(options.limit !== null) + Number(options.all) !== 1) {
    throw new Error("Choose exactly one of --project-id, --limit, or --all");
  }
  if (options.projectId) options.projectId = validateProjectId(options.projectId);
  if (options.afterProjectId) options.afterProjectId = validateProjectId(options.afterProjectId);
  if (options.projectId && options.afterProjectId) {
    throw new Error("--after-project-id cannot be combined with --project-id");
  }
  if (options.limit !== null && (!Number.isSafeInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  if (!Number.isSafeInteger(options.delayMs) || options.delayMs < 0 || options.delayMs > 60000) {
    throw new Error("--delay-ms must be an integer from 0 to 60000");
  }
  if (options.apply && options.confirm !== APPLY_CONFIRMATION) {
    throw new Error(`Refusing writes: pass --confirm ${APPLY_CONFIRMATION} with --apply`);
  }
  if (!options.apply && options.confirm) throw new Error("--confirm requires --apply");
  return options;
}

async function run(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  const mongo = dependencies.mongoose || mongoose;
  const collection = dependencies.collection || GovProject.collection;
  const discover = dependencies.discoverDraftEbidding ||
    ((projectId) => nationalEgpAdapter.discoverDraftEbidding(projectId));
  const getEgpDiagnostics = dependencies.getEgpDiagnostics ||
    (() => nationalEgpAdapter.getRequestDiagnostics());
  const sleep = dependencies.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const mongoUri = dependencies.mongoUri || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required");

  await mongo.connect(mongoUri);
  try {
    const filter = options.projectId ? { project_id: options.projectId }
      : options.afterProjectId ? { project_id: { $gt: options.afterProjectId } } : {};
    if (options.draftOnly) {
      filter["documents.invitation.status"] = "not_found";
      filter["documents.draftEbidding.status"] = "available";
    }
    let cursor = collection.find(filter, {
      projection: { _id: 1, project_id: 1, "documents.invitation.status": 1,
        "documents.draftEbidding": 1 },
    }).sort({ project_id: 1 });
    if (options.limit) cursor = cursor.limit(options.limit);
    const reports = [];
    let stoppedReason = null;
    let lookups = 0;
    for await (const project of cursor) {
      const storedDraft = project.documents?.draftEbidding || {};
      if (options.draftOnly && (
        project.documents?.invitation?.status !== "not_found" || storedDraft.status !== "available"
      )) {
        reports.push({ projectId: project.project_id, outcome: "not_eligible" });
        continue;
      }
      const usableDraft = isUsableDocumentReference("draftEbidding", storedDraft, project.project_id);
      if (!usableDraft && storedDraft.commentDeadlineAt == null) {
        reports.push({ projectId: project.project_id, outcome: "no_stored_draft" });
        continue;
      }
      let plan;
      if (!usableDraft) {
        plan = planDraftDeadlineBackfill(project, { status: "not_found" });
      } else {
        if (lookups > 0 && options.delayMs > 0) await sleep(options.delayMs);
        lookups += 1;
        const rateLimitsBefore = Number(getEgpDiagnostics()?.rateLimitResponses || 0);
        try {
          const observed = await discover(project.project_id);
          const rateLimitsAfter = Number(getEgpDiagnostics()?.rateLimitResponses || 0);
          if (rateLimitsAfter > rateLimitsBefore) {
            reports.push({ projectId: project.project_id, outcome: "rate_limited" });
            stoppedReason = "egp_rate_limited";
            break;
          }
          plan = planDraftDeadlineBackfill(project, observed);
        } catch (error) {
          const rateLimited = error.code === "EGP_RATE_LIMITED" ||
            Number(getEgpDiagnostics()?.rateLimitResponses || 0) > rateLimitsBefore;
          reports.push({ projectId: project.project_id, outcome: rateLimited ? "rate_limited" : "unverified",
            errorCode: error.code || "DISCOVERY_FAILED" });
          if (rateLimited) {
            stoppedReason = "egp_rate_limited";
            break;
          }
          continue;
        }
      }
      const report = {
        projectId: plan.projectId,
        outcome: plan.outcome,
        fileName: project.documents?.draftEbidding?.fileName || null,
        revision: project.documents?.draftEbidding?.revision ?? null,
        ...(plan.operation ? { previous: plan.previous, next: plan.next } : {}),
      };
      if (plan.operation && options.apply) {
        const { filter, update, upsert } = plan.operation.updateOne;
        const result = await collection.updateOne(filter, update, { upsert });
        report.outcome = result.matchedCount === 1 ? "updated" : "conflict";
        report.plannedAction = plan.outcome;
      }
      reports.push(report);
    }
    const output = {
      mode: options.apply ? "apply" : "dry-run",
      draftOnly: options.draftOnly,
      afterProjectId: options.afterProjectId,
      stoppedReason,
      summary: Object.fromEntries([...new Set(reports.map((report) => report.outcome))]
        .map((outcome) => [outcome, reports.filter((report) => report.outcome === outcome).length])),
      reports,
    };
    (dependencies.logger || console.log)(JSON.stringify(output, null, 2));
    if (stoppedReason) throw new Error("Stopped after e-GP rate limiting; retry later with a small batch");
    if (reports.some((report) => report.outcome === "conflict")) {
      throw new Error("One or more guarded deadline updates conflicted");
    }
    return output;
  } finally {
    await mongo.disconnect();
  }
}

if (require.main === module) {
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { APPLY_CONFIRMATION, parseArgs, run };

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyImportPlans,
  buildImportPlan,
  buildRollbackPlans,
  sanitizeAnalysisForMongo,
} = require("../src/services/procurementAnalysis/mongoImportService");
const {
  APPLY_CONFIRMATION,
  ROLLBACK_CONFIRMATION,
  parseArgs,
  run,
} = require("../scripts/importProcurementAnalysis");
const GovProject = require("../src/models/GovProject");

const PROJECT_ID = "67049068372";

function validAnalysis(overrides = {}) {
  const emptyResult = { status: "not_found", evidence: [], conflicts: [] };
  return {
    schemaVersion: 3,
    analysisVersion: "3.2",
    promptVersion: "test",
    projectId: PROJECT_ID,
    generatedAt: "2026-10-12T00:00:00.000Z",
    fingerprint: "fingerprint-1",
    model: { provider: "vertex-ai", name: "test", location: "global" },
    status: "complete",
    coverage: { status: "complete", warnings: [] },
    processing: { documentCount: 1, totalRequests: 1, processedRequests: 1, complete: true, documents: [], elapsedMs: 999, tokenUsage: { totalTokens: 1 } },
    prices: { referencePriceEstimate: { ...emptyResult }, allocatedBudget: { ...emptyResult } },
    torSummary: {
      status: "unavailable",
      coverageStatus: "complete",
      sections: {
        projectDetails: { status: "unavailable", text: null, evidence: [] },
        objectives: { status: "unavailable", items: [] },
        scopeOfWork: { status: "unavailable", items: [] },
        contractorQualifications: { generalLegal: [], projectSpecific: [] },
        technicalRequirements: { status: "unavailable", items: [] },
        deliverables: { status: "unavailable", items: [] },
      },
      conflicts: [],
      unavailableSections: [],
    },
    deadlines: { biddingClosingDate: { ...emptyResult, coverageStatus: "complete" }, draftClosingDate: { status: "found" } },
    documentAssessment: { status: "not_found", coverageStatus: "complete", evidence: [] },
    diagnostics: { candidateDiagnostics: [{ rawCandidate: "do not store" }] },
    markdown: "do not store",
    ...overrides,
  };
}

function incompleteAnalysisWithMissingManifests(overrides = {}) {
  return validAnalysis({
    status: "incomplete",
    coverage: {
      status: "incomplete",
      categories: {
        priceEstimate: { manifestAvailable: true, eligible: 1, unavailable: 0 },
        invitation: { manifestAvailable: false, eligible: 0, unavailable: 0 },
        draftEbidding: { manifestAvailable: false, eligible: 0, unavailable: 0 },
      },
      warnings: [
        { code: "MISSING_MANIFEST", category: "invitation" },
        { code: "MISSING_MANIFEST", category: "draftEbidding" },
      ],
    },
    processing: {
      documentCount: 1,
      totalRequests: 1,
      processedRequests: 1,
      complete: false,
      documents: [{ processed: true, errors: [] }],
    },
    diagnostics: { errors: [] },
    ...overrides,
  });
}

test("import CLI is dry-run by default and guards apply and rollback independently", () => {
  assert.equal(parseArgs(["--project-id", PROJECT_ID]).apply, false);
  assert.throws(() => parseArgs(["--all", "--apply"]), /Refusing writes/);
  assert.doesNotThrow(() => parseArgs(["--all", "--apply", "--confirm", APPLY_CONFIRMATION]));
  assert.throws(() => parseArgs(["--rollback", "backup.json", "--apply", "--confirm", APPLY_CONFIRMATION]), /Refusing rollback/);
  assert.doesNotThrow(() => parseArgs(["--rollback", "backup.json", "--apply", "--confirm", ROLLBACK_CONFIRMATION]));
});

test("Mongo payload preserves schema-v3 business data and removes diagnostics and draftClosingDate", () => {
  const payload = sanitizeAnalysisForMongo(validAnalysis());
  assert.equal(payload.schemaVersion, 3);
  assert.deepEqual(payload.referencePriceEstimate, { amount: null, currency: null });
  assert.deepEqual(payload.objectives, []);
  assert.deepEqual(payload.contractorQualifications, { generalLegal: [], projectSpecific: [] });
  assert.equal(payload.diagnostics, undefined);
  assert.equal(payload.markdown, undefined);
  assert.equal(payload.processing, undefined);
  assert.equal(payload.coverage, undefined);
  assert.equal(payload.model, undefined);
  assert.equal(payload.deadlines, undefined);
  assert.equal(payload.torSummary, undefined);
  assert.equal(payload.evidence, undefined);
  assert.equal(payload.documentAssessment, undefined);
});

test("GovProject schema retains the dedicated procurementAnalysis payload", async () => {
  const payload = sanitizeAnalysisForMongo(validAnalysis());
  const project = new GovProject({ project_id: PROJECT_ID, project_name: "test", procurementAnalysis: payload });
  await project.validate();
  assert.deepEqual(project.toObject().procurementAnalysis.objectives, []);
  assert.equal(project.toObject().procurementAnalysis.schemaVersion, 3);
});

test("Mongo payload maps frontend values without evidence or source paths", () => {
  const analysis = validAnalysis({
    prices: {
      referencePriceEstimate: { status: "found", amount: 3575081.86, currency: "THB", evidence: [{ quote: "debug only", evidenceStatus: "VERIFIED" }] },
      allocatedBudget: { status: "found", amount: 5201400, currency: "THB", evidence: [{ quote: "debug only", evidenceStatus: "VERIFIED" }] },
    },
  });
  analysis.torSummary.sections.projectDetails = { status: "found", text: "โครงการทดสอบ", evidence: [{ textRef: "local.txt", evidenceStatus: "VERIFIED" }] };
  analysis.torSummary.sections.objectives.items = [{ text: "วัตถุประสงค์หนึ่ง", evidence: [{ quote: "debug only", evidenceStatus: "VERIFIED" }] }];
  analysis.deadlines.biddingClosingDate = {
    status: "found",
    coverageStatus: "complete",
    normalizedDate: "2024-05-23",
    submissionWindow: { start: "09:00", end: "12:00" },
    closingDateTime: "2024-05-23T12:00:00+07:00",
    timezone: "Asia/Bangkok",
    evidence: [{ quote: "debug only", evidenceStatus: "VERIFIED" }],
  };
  const payload = sanitizeAnalysisForMongo(analysis);
  assert.equal(payload.referencePriceEstimate.amount, 3575081.86);
  assert.equal(payload.allocatedBudget.amount, 5201400);
  assert.equal(payload.projectDetails, "โครงการทดสอบ");
  assert.deepEqual(payload.objectives, ["วัตถุประสงค์หนึ่ง"]);
  assert.deepEqual(payload.biddingClosingDate, {
    date: "2024-05-23",
    startTime: "09:00",
    endTime: "12:00",
    dateTime: "2024-05-23T12:00:00+07:00",
    timezone: "Asia/Bangkok",
  });
  assert.doesNotMatch(JSON.stringify(payload), /evidence|quote|textRef|pdfRef|manifestRef/);
  assert.equal(payload.documentAssessment, undefined);
});

test("planning skips identical records and detects missing and duplicate database IDs", () => {
  const analysis = validAnalysis();
  const stored = sanitizeAnalysisForMongo(analysis);
  const plan = buildImportPlan(
    [
      { projectId: PROJECT_ID, analysis },
      { projectId: "68000000002", analysis: validAnalysis({ projectId: "68000000002", fingerprint: "two" }) },
      { projectId: "69000000003", analysis: validAnalysis({ projectId: "69000000003", fingerprint: "three" }) },
    ],
    [
      { _id: "one", project_id: PROJECT_ID, procurementAnalysis: stored },
      { _id: "duplicate-a", project_id: "68000000002" },
      { _id: "duplicate-b", project_id: "68000000002" },
    ]
  );
  assert.equal(plan.summary.unchanged, 1);
  assert.equal(plan.summary.missing, 1);
  assert.equal(plan.summary.duplicates, 1);
  assert.equal(plan.plans.length, 0);
});

test("planning accepts missing manifests only when Phase A confirms authoritative absence", () => {
  const analysis = incompleteAnalysisWithMissingManifests();
  const plan = buildImportPlan(
    [{ projectId: PROJECT_ID, analysis }],
    [{
      _id: "one",
      project_id: PROJECT_ID,
      documents: {
        priceEstimate: { status: "available" },
        invitation: { status: "not_found" },
        draftEbidding: { status: "not_found" },
      },
    }]
  );
  assert.equal(plan.summary.valid, 1);
  assert.equal(plan.summary.planned, 1);
  assert.deepEqual(plan.reports[0].authoritativeAbsences, ["draftEbidding", "invitation"]);
  assert.deepEqual(plan.plans[0].importedAnalysis.objectives, []);
  assert.equal(plan.plans[0].importedAnalysis.projectDetails, null);
});

test("planning rejects a missing local manifest when Phase A says the document is available", () => {
  const analysis = incompleteAnalysisWithMissingManifests();
  const plan = buildImportPlan(
    [{ projectId: PROJECT_ID, analysis }],
    [{
      _id: "one",
      project_id: PROJECT_ID,
      documents: {
        priceEstimate: { status: "available" },
        invitation: { status: "available" },
        draftEbidding: { status: "not_found" },
      },
    }]
  );
  assert.equal(plan.summary.invalid, 1);
  assert.match(plan.reports[0].errors.join("; "), /analysis status must be complete/);
});

test("planning rejects incomplete analysis for non-manifest warnings or failed document processing", () => {
  const documents = {
    priceEstimate: { status: "available" },
    invitation: { status: "not_found" },
    draftEbidding: { status: "not_found" },
  };
  const nonManifest = incompleteAnalysisWithMissingManifests();
  nonManifest.coverage.warnings.push({ code: "MISSING_TXT", category: "priceEstimate" });
  const failedProcessing = incompleteAnalysisWithMissingManifests();
  failedProcessing.processing.documents[0] = { processed: false, errors: ["mock failure"] };

  for (const analysis of [nonManifest, failedProcessing]) {
    const plan = buildImportPlan(
      [{ projectId: PROJECT_ID, analysis }],
      [{ _id: "one", project_id: PROJECT_ID, documents }]
    );
    assert.equal(plan.summary.invalid, 1);
    assert.equal(plan.plans.length, 0);
  }
});

test("apply uses guarded non-upsert writes and isolates a failed project", async () => {
  const calls = [];
  const plans = ["67000000001", "68000000002"].map((projectId) => ({
    projectId,
    operation: { updateOne: { filter: { _id: projectId, project_id: projectId }, update: { $set: { procurementAnalysis: { projectId } } }, upsert: false } },
  }));
  const results = await applyImportPlans(plans, async (filter, _update, options) => {
    calls.push({ filter, options });
    if (filter.project_id === "67000000001") throw new Error("mock failure");
    return { matchedCount: 1, modifiedCount: 1 };
  });
  assert.equal(results[0].error, "mock failure");
  assert.equal(results[1].modifiedCount, 1);
  assert.deepEqual(calls[1].options, { upsert: false });
});

test("rollback is guarded by the imported fingerprint and restores absence with $unset", () => {
  const importedAnalysis = sanitizeAnalysisForMongo(validAnalysis());
  const backup = { type: "procurement-analysis-backup", schemaVersion: 1, records: [{ projectId: PROJECT_ID, hadPriorAnalysis: false, importedAnalysis }] };
  const rollback = buildRollbackPlans(backup, [{ _id: "mongo-id", project_id: PROJECT_ID, procurementAnalysis: importedAnalysis }]);
  assert.equal(rollback.plans.length, 1);
  assert.deepEqual(rollback.plans[0].operation.updateOne.update, { $unset: { procurementAnalysis: "" } });
  assert.equal(rollback.plans[0].operation.updateOne.upsert, false);
});

test("mocked apply writes backup first and verifies the stored analysis", async () => {
  const analysis = validAnalysis();
  const events = [];
  let stored;
  const collection = {
    find() { return { toArray: async () => [{ _id: "mongo-id", project_id: PROJECT_ID }] }; },
    async updateOne(_filter, update, options) { events.push("write"); assert.equal(options.upsert, false); stored = update.$set.procurementAnalysis; return { matchedCount: 1, modifiedCount: 1 }; },
    async findOne() { events.push("verify"); return { procurementAnalysis: stored }; },
  };
  const output = await run(["--project-id", PROJECT_ID, "--apply", "--confirm", APPLY_CONFIRMATION], {
    mongoUri: "mongodb://test.invalid/database",
    mongoose: { connect: async () => {}, disconnect: async () => {} },
    GovProject: { collection },
    fs: { readFile: async () => JSON.stringify(analysis) },
    writeBackup: async () => { events.push("backup"); return "backup.json"; },
    logger: () => {},
  });
  assert.deepEqual(events, ["backup", "write", "verify"]);
  assert.equal(output.verification[0].verified, true);
});

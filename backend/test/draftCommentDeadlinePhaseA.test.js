const test = require("node:test");
const assert = require("node:assert/strict");
const { getDraftEbiddingMetadata } = require("../src/services/egp/client/process5Draft");
const { buildProjectEnrichmentPlan } = require("../src/services/govProjectDocumentEnrichmentService");
const { planProjectDocumentExtraction } = require("../src/services/govProjectDocumentExtractionService");
const {
  planDraftDeadlineBackfill,
} = require("../src/services/govProjectDraftDeadlineBackfillService");
const { parseArgs, run } = require("../scripts/backfillDraftCommentDeadlines");

const projectId = "69099214663";
const publicDocuments = [{
  projectId,
  announceType: "B3",
  templateType: "D1",
  announceFlag: "A",
  announceDate: "2026-10-14T00:00:00.000Z",
}];

function json(payload) { return new Response(JSON.stringify(payload)); }
function response(data) { return json({ response: { responseCode: 0 }, data }); }
function candidate(revision) {
  return {
    projectId,
    ...(revision ? { itemNo: revision } : {}),
    zipId: `zip-${revision}`,
    buildName1: `${projectId}_${revision ? `1${revision}` : "12"}102569${revision ? `_${revision}` : ""}.zip`,
    buildName2: `template-${revision}`,
  };
}
function fetchDraft({ records = [], failDeadline = false, reuseTemplate = false } = {}) {
  return async (url) => {
    if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) return response(candidate(0));
    if (url.pathname.endsWith("infoProcureDocAnnounZipAdj")) {
      const revision = Number(url.searchParams.get("itemNo"));
      return revision === 1 ? response([{ ...candidate(1),
        ...(reuseTemplate ? { buildName2: "template-0" } : {}) }])
        : json({ response: { responseCode: 1, messageCode: "E0001" }, data: null });
    }
    if (url.pathname.endsWith("getTorZipList")) {
      if (failDeadline) throw new Error("deadline source unavailable");
      return response(records);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
}
function dateRecord(template, deadline, stepId = "U03") {
  return { projectId, buildName: template, stepId, commentFDate: deadline };
}

test("new Phase A project saves the latest ZIP and its own verified comment deadline", async () => {
  const selected = await getDraftEbiddingMetadata(projectId, { fetchImpl: fetchDraft({
    records: [
      dateRecord("template-0", "2026-10-18T17:00:00.000Z", "D03"),
      dateRecord("template-1", "2026-10-19T17:00:00.000Z"),
    ],
  }) }, publicDocuments);
  assert.equal(selected.fileId, "zip-1");
  assert.equal(selected.revision, 1);
  assert.equal(selected.commentDeadlineAt, "2026-10-19T17:00:00.000Z");

  const plan = buildProjectEnrichmentPlan({
    _id: "new-id", project_id: projectId, documents: {},
  }, { documents: {
    priceEstimate: { status: "not_found" },
    invitation: { status: "not_found" },
    draftEbidding: selected,
  } });
  assert.equal(plan.operation.updateOne.update.$set["documents.draftEbidding"].fileId, "zip-1");
  assert.equal(plan.operation.updateOne.update.$set["documents.draftEbidding"].commentDeadlineAt,
    "2026-10-19T17:00:00.000Z");
});

test("latest revision without a verified date never inherits an older deadline", async () => {
  const selected = await getDraftEbiddingMetadata(projectId, { fetchImpl: fetchDraft({
    records: [dateRecord("template-0", "2026-10-18T17:00:00.000Z", "D03")],
  }) }, publicDocuments);
  assert.equal(selected.fileId, "zip-1");
  assert.equal(selected.commentDeadlineAt, null);
});

test("an initial Draft ZIP uses only its matching D03 record", async () => {
  const selected = await getDraftEbiddingMetadata(projectId, { fetchImpl: async (url) => {
    if (url.pathname.endsWith("infoProcureDocAnnounZipTemp")) return response(candidate(0));
    if (url.pathname.endsWith("infoProcureDocAnnounZipAdj")) {
      return json({ response: { responseCode: 1, messageCode: "E0001" }, data: null });
    }
    if (url.pathname.endsWith("getTorZipList")) {
      return response([dateRecord("template-0", "2026-10-18T17:00:00.000Z", "D03")]);
    }
    throw new Error(`Unexpected request: ${url}`);
  } }, publicDocuments);
  assert.equal(selected.fileId, "zip-0");
  assert.equal(selected.commentDeadlineAt, "2026-10-18T17:00:00.000Z");
});

test("a template ID reused across revisions cannot supply the latest deadline", async () => {
  const selected = await getDraftEbiddingMetadata(projectId, { fetchImpl: fetchDraft({
    reuseTemplate: true,
    records: [dateRecord("template-0", "2026-10-18T17:00:00.000Z", "D03")],
  }) }, publicDocuments);
  assert.equal(selected.fileId, "zip-1");
  assert.equal(selected.commentDeadlineAt, null);
});

test("conflicting or unavailable deadline metadata leaves the selected ZIP usable", async () => {
  for (const scenario of [
    { records: [dateRecord("template-1", "2026-10-19T17:00:00.000Z"),
      dateRecord("template-1", "2026-10-20T17:00:00.000Z")] },
    { failDeadline: true },
  ]) {
    const selected = await getDraftEbiddingMetadata(projectId,
      { fetchImpl: fetchDraft(scenario), maxRetries: 0 }, publicDocuments);
    assert.equal(selected.status, "available");
    assert.equal(selected.fileId, "zip-1");
    assert.equal(selected.commentDeadlineAt, null);
  }
});

function storedDraft(overrides = {}) {
  return {
    status: "available", source: "national_egp", lookupMethod: "draft_approval_adjusted",
    downloadMethod: "file_id", fileId: "zip-1", fileName: candidate(1).buildName1,
    downloadUrl: "https://process5.gprocurement.go.th/egp-upload-service/v1/downloadFileTest?fileId=zip-1",
    revision: 1, version: "revision_1", commentDeadlineAt: null, ...overrides,
  };
}

test("existing-project backfill changes only the deadline and preserves Phase B ZIP identity", () => {
  const stored = storedDraft();
  const project = {
    _id: "existing-id", project_id: projectId,
    documents: { draftEbidding: stored, invitation: { status: "available", fileId: "invitation" } },
    procurementAnalysis: { biddingClosingDate: { date: "2026-11-01" } },
    documentExtraction: { status: "text_extracted" },
  };
  const before = planProjectDocumentExtraction(project).categories.draftEbidding.locatorIdentity;
  const plan = planDraftDeadlineBackfill(project,
    storedDraft({ commentDeadlineAt: "2026-10-19T17:00:00.000Z" }));
  assert.equal(plan.outcome, "set_deadline");
  assert.deepEqual(Object.keys(plan.operation.updateOne.update.$set),
    ["documents.draftEbidding.commentDeadlineAt"]);
  assert.deepEqual(plan.operation.updateOne.filter["documents.draftEbidding"], stored);
  assert.equal(plan.operation.updateOne.upsert, false);
  const after = planProjectDocumentExtraction({ ...project, documents: {
    ...project.documents, draftEbidding: { ...stored,
      commentDeadlineAt: plan.operation.updateOne.update.$set["documents.draftEbidding.commentDeadlineAt"] },
  } }).categories.draftEbidding.locatorIdentity;
  assert.equal(after, before);
});

test("backfill clears a stale date when the selected revision lacks verification or has changed", () => {
  const project = { _id: "existing-id", project_id: projectId,
    documents: { draftEbidding: storedDraft({ commentDeadlineAt: new Date("2026-10-18T17:00:00.000Z") }) } };
  const missing = planDraftDeadlineBackfill(project, storedDraft());
  assert.equal(missing.outcome, "clear_unverified_deadline");
  assert.equal(missing.operation.updateOne.update.$set["documents.draftEbidding.commentDeadlineAt"], null);
  const changed = planDraftDeadlineBackfill(project, storedDraft({ fileId: "new-zip" }));
  assert.equal(changed.outcome, "clear_stale_deadline");
  assert.equal(changed.operation.updateOne.update.$set["documents.draftEbidding.commentDeadlineAt"], null);
  assert.equal(planDraftDeadlineBackfill(project, { status: "error" }).operation, null);
});

test("backfill CLI is dry-run by default and cannot write without an explicit apply token", async () => {
  assert.equal(parseArgs(["--all"]).apply, false);
  assert.throws(() => parseArgs(["--all", "--apply"]), /Refusing writes/);
  assert.throws(() => parseArgs(["--project-id"]), /requires a value/);
  let writes = 0;
  const project = { _id: "existing-id", project_id: projectId,
    documents: { draftEbidding: storedDraft() } };
  let lastUpdate;
  const collection = {
    find: () => ({ sort: () => ({ async *[Symbol.asyncIterator]() { yield project; } }) }),
    updateOne: async (...args) => { writes += 1; lastUpdate = args; return { matchedCount: 1 }; },
  };
  const mongo = { connect: async () => {}, disconnect: async () => {} };
  const options = { collection, mongoose: mongo, mongoUri: "mock", logger: () => {},
    discoverDraftEbidding: async () => storedDraft({ commentDeadlineAt: "2026-10-19T17:00:00.000Z" }) };
  const dryRun = await run(["--all"], options);
  assert.equal(dryRun.reports[0].outcome, "set_deadline");
  assert.equal(writes, 0);
  const applied = await run(["--all", "--apply", "--confirm",
    "APPLY_DRAFT_COMMENT_DEADLINE_BACKFILL"], options);
  assert.equal(applied.reports[0].outcome, "updated");
  assert.equal(writes, 1);
  assert.deepEqual(Object.keys(lastUpdate[1].$set), ["documents.draftEbidding.commentDeadlineAt"]);
  assert.deepEqual(lastUpdate[0]["documents.draftEbidding"], project.documents.draftEbidding);
});

test("backfill stops at the first e-GP 429 even when discovery recovers", async () => {
  const projects = ["69099214663", "68059426756"].map((id) => ({
    _id: id, project_id: id, documents: { draftEbidding: storedDraft() },
  }));
  let rateLimitResponses = 0;
  let discoveries = 0;
  let writes = 0;
  const collection = {
    find: () => ({ sort: () => ({ async *[Symbol.asyncIterator]() {
      for (const project of projects) yield project;
    } }) }),
    updateOne: async () => { writes += 1; return { matchedCount: 1 }; },
  };
  await assert.rejects(() => run(["--all"], {
    collection,
    mongoose: { connect: async () => {}, disconnect: async () => {} },
    mongoUri: "mock",
    logger: () => {},
    getEgpDiagnostics: () => ({ rateLimitResponses }),
    discoverDraftEbidding: async () => {
      discoveries += 1;
      rateLimitResponses += 1;
      return storedDraft({ commentDeadlineAt: "2026-10-19T17:00:00.000Z" });
    },
  }), /Stopped after e-GP rate limiting/);
  assert.equal(discoveries, 1);
  assert.equal(writes, 0);
});

test("backfill skips projects without stored Draft ZIPs and can resume after a project ID", async () => {
  const projects = [
    { _id: "none", project_id: "66017411940", documents: {} },
    { _id: "draft", project_id: projectId,
      documents: { draftEbidding: storedDraft() } },
  ];
  let query;
  let lookups = 0;
  const collection = {
    find: (filter) => {
      query = filter;
      return { sort: () => ({ async *[Symbol.asyncIterator]() {
        for (const project of projects) yield project;
      } }) };
    },
  };
  const output = await run(["--all", "--after-project-id", "65077164290"], {
    collection,
    mongoose: { connect: async () => {}, disconnect: async () => {} },
    mongoUri: "mock",
    logger: () => {},
    discoverDraftEbidding: async () => {
      lookups += 1;
      return storedDraft({ commentDeadlineAt: "2026-10-19T17:00:00.000Z" });
    },
  });
  assert.deepEqual(query, { project_id: { $gt: "65077164290" } });
  assert.equal(output.reports[0].outcome, "no_stored_draft");
  assert.equal(output.reports[1].outcome, "set_deadline");
  assert.equal(lookups, 1);
  assert.throws(() => parseArgs(["--project-id", projectId,
    "--after-project-id", "65077164290"]), /cannot be combined/);
});

test("draft-only backfill queries only Draft-eligible Mongo projects", async () => {
  const projects = [
    { _id: "invitation", project_id: "68059426756", documents: {
      invitation: { status: "available" }, draftEbidding: storedDraft() } },
    { _id: "draft", project_id: projectId, documents: {
      invitation: { status: "not_found" }, draftEbidding: storedDraft() } },
  ];
  let query;
  let lookups = 0;
  const result = await run(["--all", "--draft-only"], {
    collection: { find: (filter) => {
      query = filter;
      return { sort: () => ({ async *[Symbol.asyncIterator]() {
        for (const project of projects) yield project;
      } }) };
    } },
    mongoose: { connect: async () => {}, disconnect: async () => {} },
    mongoUri: "mock",
    logger: () => {},
    discoverDraftEbidding: async () => {
      lookups += 1;
      return storedDraft({ commentDeadlineAt: "2026-10-19T17:00:00.000Z" });
    },
  });
  assert.deepEqual(query, {
    "documents.invitation.status": "not_found",
    "documents.draftEbidding.status": "available",
  });
  assert.equal(lookups, 1);
  assert.deepEqual(result.reports.map((report) => report.outcome),
    ["not_eligible", "set_deadline"]);
});

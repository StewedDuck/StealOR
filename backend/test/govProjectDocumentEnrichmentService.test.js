const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canonicalLocatorIdentity,
  isUsableDocumentReference,
  mergeDocumentReference,
} = require("../src/services/egp/documentReferencePolicy");
const {
  applyDocumentEnrichmentPlans,
  buildProjectEnrichmentPlan,
  planDocumentEnrichment,
} = require("../src/services/govProjectDocumentEnrichmentService");
const {
  getLocalFilteredProjects,
} = require("../src/services/localProjectProvider");

const PROJECT_ID = "68059426756";

function available(fileId, extra = {}) {
  return {
    status: "available",
    source: "national_egp",
    lookupMethod: "test_lookup",
    downloadMethod: "file_id",
    fileId,
    fileName: `${fileId}.zip`,
    ...extra,
  };
}

function discoveryDocuments(overrides = {}) {
  return {
    priceEstimate: available("price-id"),
    invitation: available("invitation-id"),
    draftEbidding: available("draft-id"),
    selectedProcurementDocument: "invitation",
    ...overrides,
  };
}

test("current local provider returns the actual 27 records without hard-coded count", async () => {
  const projects = await getLocalFilteredProjects();
  assert.equal(projects.length, 27);
  assert.equal(new Set(projects.map(({ project_id }) => project_id)).size, 27);
  assert.ok(projects.every(({ project_id }) => /^\d{11}$/.test(project_id)));
});

test("canonical locator identity is stable and category-specific", () => {
  const reference = available("same-id");
  const first = canonicalLocatorIdentity(PROJECT_ID, "invitation", reference);
  const second = canonicalLocatorIdentity(PROJECT_ID, "invitation", {
    ...reference,
    lastCheckedAt: new Date(),
  });
  const otherCategory = canonicalLocatorIdentity(
    PROJECT_ID,
    "priceEstimate",
    reference
  );
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, otherCategory);
});

test("usable references recognize file IDs and complete Legacy Draft locators", () => {
  assert.equal(isUsableDocumentReference("invitation", available("id")), true);
  assert.equal(
    isUsableDocumentReference("invitation", {
      status: "available",
      downloadMethod: "file_id",
      fileId: null,
    }),
    false
  );
  assert.equal(
    isUsableDocumentReference("draftEbidding", {
      status: "available",
      downloadMethod: "legacy_draft_transfer",
      fileName: "65077164290_25650831154250_2.zip",
      legacyItemNo: 3,
      legacyTypeId: "04",
      legacyDocType: "adj",
      legacyMethodId: "16",
    }),
    true
  );
});

for (const [status, expectedAction] of [
  ["not_found", "preserved_after_not_found"],
  ["error", "preserved_after_error"],
  ["ambiguous", "preserved_after_ambiguous"],
]) {
  test(`merge preserves usable metadata after ${status}`, () => {
    const stored = available("stored-id", { sha256: "stored-hash" });
    const merged = mergeDocumentReference({
      projectId: PROJECT_ID,
      category: "invitation",
      stored,
      observed: { status },
    });
    assert.equal(merged.action, expectedAction);
    assert.deepEqual(merged.effective, stored);
    assert.ok(merged.discrepancy);
  });
}

test("merge preserves usable metadata after incomplete available refresh", () => {
  const stored = available("stored-id");
  const merged = mergeDocumentReference({
    projectId: PROJECT_ID,
    category: "invitation",
    stored,
    observed: {
      status: "available",
      downloadMethod: "file_id",
      fileId: null,
    },
  });
  assert.equal(merged.action, "preserved_after_incomplete_available");
  assert.equal(merged.discrepancy, "incomplete_available");
  assert.equal(merged.effective.fileId, "stored-id");
});

test("rate-limited refresh preserves a usable stored Invitation locator", () => {
  const stored = available("stored-invitation", { sha256: "stored-hash" });
  const merged = mergeDocumentReference({
    projectId: PROJECT_ID,
    category: "invitation",
    stored,
    observed: {
      status: "error",
      error: {
        code: "EGP_RATE_LIMITED",
        kind: "rate_limited",
        message: "e-GP rate limit exceeded",
      },
    },
  });

  assert.deepEqual(merged.effective, stored);
  assert.equal(merged.action, "preserved_after_error");
  assert.equal(merged.discrepancy, "upstream_error");
});

test("merge stores non-available observations when no usable reference exists", () => {
  const merged = mergeDocumentReference({
    projectId: PROJECT_ID,
    category: "invitation",
    stored: { status: "not_checked" },
    observed: { status: "not_found", lookupMethod: "invitation_lookup" },
  });
  assert.equal(merged.action, "accepted_non_available");
  assert.equal(merged.effective.status, "not_found");
});

test("incomplete available metadata without a fallback becomes an explicit error", () => {
  const merged = mergeDocumentReference({
    projectId: PROJECT_ID,
    category: "invitation",
    stored: { status: "not_checked" },
    observed: {
      status: "available",
      source: "national_egp",
      lookupMethod: "invitation_lookup",
      fileId: null,
    },
  });
  assert.equal(merged.action, "rejected_incomplete_available");
  assert.equal(merged.discrepancy, "incomplete_available");
  assert.equal(merged.effective.status, "error");
  assert.equal(
    merged.effective.error.code,
    "EGP_INCOMPLETE_DOCUMENT_REFERENCE"
  );
});

test("same locator retains hash while a changed locator clears it", () => {
  const stored = available("stored-id", { sha256: "abc123" });
  const same = mergeDocumentReference({
    projectId: PROJECT_ID,
    category: "priceEstimate",
    stored,
    observed: available("stored-id"),
  });
  const changed = mergeDocumentReference({
    projectId: PROJECT_ID,
    category: "priceEstimate",
    stored,
    observed: available("new-id"),
  });
  assert.equal(same.effective.sha256, "abc123");
  assert.equal(changed.effective.sha256, undefined);
  assert.equal(changed.action, "replaced_locator");
});

test("effective selection uses preserved Invitation and retains every category", () => {
  const project = {
    _id: "mongo-id",
    project_id: PROJECT_ID,
    updatedAt: new Date("2026-10-03T00:00:00.000Z"),
    documents: {
      priceEstimate: available("old-price"),
      invitation: available("old-invitation"),
      draftEbidding: available("old-draft"),
      selectedProcurementDocument: "invitation",
    },
  };
  const plan = buildProjectEnrichmentPlan(project, {
    documents: discoveryDocuments({
      invitation: { status: "not_found" },
      draftEbidding: available("new-draft"),
    }),
  });

  assert.equal(plan.categories.invitation.action, "preserved_after_not_found");
  assert.equal(plan.effectiveSelection, "invitation");
  assert.equal(plan.effectiveDocuments.priceEstimate.status, "available");
  assert.equal(plan.effectiveDocuments.invitation.status, "available");
  assert.equal(plan.effectiveDocuments.draftEbidding.status, "available");
  assert.equal(
    "documents.invitation" in plan.operation.updateOne.update.$set,
    false
  );
});

test("planned update is restricted to document paths with upsert false", () => {
  const plan = buildProjectEnrichmentPlan(
    {
      _id: "mongo-id",
      project_id: PROJECT_ID,
      updatedAt: new Date("2026-10-03T00:00:00.000Z"),
      documents: {},
    },
    { documents: discoveryDocuments() }
  );
  const operation = plan.operation.updateOne;
  assert.equal(operation.upsert, false);
  assert.deepEqual(operation.filter, {
    _id: "mongo-id",
    project_id: PROJECT_ID,
    updatedAt: new Date("2026-10-03T00:00:00.000Z"),
  });
  assert.ok(
    Object.keys(operation.update.$set).every((key) => key.startsWith("documents."))
  );
  assert.equal("raw_data" in operation.update.$set, false);
  assert.equal("documentExtraction" in operation.update.$set, false);
});

test("records without updatedAt use the prior document snapshot for concurrency", () => {
  const storedDocuments = {
    invitation: available("stored-invitation"),
    selectedProcurementDocument: "invitation",
  };
  const plan = buildProjectEnrichmentPlan(
    {
      _id: "legacy-mongo-id",
      project_id: PROJECT_ID,
      documents: storedDocuments,
    },
    { documents: discoveryDocuments() }
  );
  assert.deepEqual(plan.operation.updateOne.filter, {
    _id: "legacy-mongo-id",
    project_id: PROJECT_ID,
    documents: storedDocuments,
  });
});

test("planner is sequential, delays between projects, and is metadata-only", async () => {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const projects = [
    { _id: "one", project_id: "65077164290", documents: {} },
    { _id: "two", project_id: "64117010720", documents: {} },
  ];
  const result = await planDocumentEnrichment(
    projects,
    { delayMs: 125 },
    {
      async discoverProjectDocuments(projectId) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        calls.push(["discover", projectId]);
        active -= 1;
        return { documents: discoveryDocuments() };
      },
      async sleep(ms) {
        calls.push(["sleep", ms]);
      },
      downloadDocument() {
        throw new Error("metadata planner must never download");
      },
    }
  );
  assert.equal(maxActive, 1);
  assert.deepEqual(calls, [
    ["discover", "65077164290"],
    ["sleep", 125],
    ["discover", "64117010720"],
  ]);
  assert.equal(result.summary.processed, 2);
  assert.equal(result.summary.planned, 2);
});

test("batch planning preserves stored metadata for periodic rate-limited categories", async () => {
  const projectIds = ["69049472497", "69099475279", "69099257828"];
  const projects = projectIds.map((projectId, index) => ({
    _id: `mongo-${index}`,
    project_id: projectId,
    documents: {
      priceEstimate: available(`stored-price-${index}`),
      invitation: available(`stored-invitation-${index}`),
      draftEbidding: available(`stored-draft-${index}`),
      selectedProcurementDocument: "invitation",
    },
  }));
  const result = await planDocumentEnrichment(
    projects,
    { delayMs: 0 },
    {
      async discoverProjectDocuments(projectId) {
        const index = projectIds.indexOf(projectId);
        return {
          documents: discoveryDocuments({
            invitation:
              index === 1
                ? {
                    status: "error",
                    error: {
                      code: "EGP_RATE_LIMITED",
                      kind: "rate_limited",
                      message: "e-GP rate limit exceeded",
                    },
                  }
                : available(`fresh-invitation-${index}`),
          }),
        };
      },
    }
  );

  const throttled = result.plans[1];
  assert.equal(throttled.effectiveDocuments.invitation.status, "available");
  assert.equal(
    throttled.effectiveDocuments.invitation.fileId,
    "stored-invitation-1"
  );
  assert.equal(throttled.categories.invitation.errorCode, "EGP_RATE_LIMITED");
  assert.equal(throttled.categories.invitation.errorKind, "rate_limited");
  assert.equal(throttled.categories.invitation.action, "preserved_after_error");
  assert.equal(
    throttled.changedPaths.includes("documents.invitation"),
    false
  );
  assert.equal(result.summary.categoryObserved.invitation.error, 1);
  assert.equal(result.plans[0].effectiveDocuments.invitation.status, "available");
  assert.equal(result.plans[2].effectiveDocuments.invitation.status, "available");
});

test("apply reports optimistic concurrency conflicts and passes upsert false", async () => {
  const plan = buildProjectEnrichmentPlan(
    { _id: "mongo-id", project_id: PROJECT_ID, documents: {} },
    { documents: discoveryDocuments() }
  );
  let receivedOptions;
  const result = await applyDocumentEnrichmentPlans([plan], {
    async updateOne(_filter, _update, options) {
      receivedOptions = options;
      return { matchedCount: 0, modifiedCount: 0 };
    },
  });
  assert.deepEqual(receivedOptions, { upsert: false });
  assert.equal(result.conflicts, 1);
  assert.equal(result.results[0].outcome, "conflict");
});

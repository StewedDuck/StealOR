const test = require("node:test");
const assert = require("node:assert/strict");
const GovProject = require("../src/models/GovProject");

test("government projects default each document category to not_checked", () => {
  const project = new GovProject({
    project_id: "68059426756",
    project_name: "Schema test",
  });

  assert.equal(project.documents.priceEstimate.status, "not_checked");
  assert.equal(project.documents.invitation.status, "not_checked");
  assert.equal(project.documents.draftEbidding.status, "not_checked");
  assert.equal(project.documents.selectedProcurementDocument, null);
  assert.equal(project.documentExtraction.status, "pending");
});

test("government project document references retain normalized metadata", async () => {
  const project = new GovProject({
    project_id: "68059426756",
    project_name: "Schema metadata test",
    documents: {
      invitation: {
        status: "available",
        source: "national_egp",
        lookupMethod: "invitation_approval_final",
        downloadMethod: "file_id",
        fileId: "invitation-id",
        fileName: "invitation.zip",
        downloadUrl: "https://example.test/invitation-id",
        lastCheckedAt: new Date("2026-10-02T10:00:00.000Z"),
      },
      selectedProcurementDocument: "invitation",
    },
  });

  await project.validate();
  assert.equal(project.documents.invitation.fileId, "invitation-id");
  assert.equal(project.documents.selectedProcurementDocument, "invitation");
});

test("government project schema retains Legacy Draft download locators", async () => {
  const project = new GovProject({
    project_id: "65077164290",
    project_name: "Legacy Draft schema test",
    documents: {
      draftEbidding: {
        status: "available",
        source: "national_egp",
        lookupMethod: "draft_legacy_public",
        downloadMethod: "legacy_draft_transfer",
        fileName: "65077164290_25650831154250_2.zip",
        publishedAt: "2022-08-30T17:00:00.000Z",
        commentDeadlineAt: "2022-09-04T17:00:00.000Z",
        legacyItemNo: 3,
        legacyTypeId: "04",
        legacyDocType: "adj",
        legacyMethodId: "16",
        legacyStepId: "U03",
        candidates: [
          {
            fileName: "65077164290_25650831154250_2.zip",
            lookupMethod: "draft_legacy_public",
            publishedAt: "2022-08-30T17:00:00.000Z",
            legacyItemNo: 3,
            legacyTypeId: "04",
            legacyDocType: "adj",
            legacyMethodId: "16",
            legacyStepId: "U03",
          },
        ],
      },
      selectedProcurementDocument: "draftEbidding",
    },
  });

  await project.validate();
  const draft = project.documents.draftEbidding;
  assert.equal(draft.downloadMethod, "legacy_draft_transfer");
  assert.equal(draft.legacyItemNo, 3);
  assert.equal(draft.legacyTypeId, "04");
  assert.equal(draft.legacyDocType, "adj");
  assert.equal(draft.legacyMethodId, "16");
  assert.equal(draft.legacyStepId, "U03");
  assert.equal(draft.candidates[0].legacyItemNo, 3);
  assert.equal(draft.candidates[0].legacyTypeId, "04");
  assert.equal(project.documents.selectedProcurementDocument, "draftEbidding");
});

test("government project document status rejects unknown values", async () => {
  const project = new GovProject({
    project_id: "68059426756",
    project_name: "Invalid schema test",
    documents: { priceEstimate: { status: "maybe" } },
  });

  await assert.rejects(project.validate(), (error) => {
    assert.ok(error?.errors?.["documents.priceEstimate.status"]);
    return true;
  });
});

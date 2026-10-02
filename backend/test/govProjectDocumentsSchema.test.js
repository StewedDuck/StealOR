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

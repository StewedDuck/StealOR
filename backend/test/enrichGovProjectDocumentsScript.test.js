const test = require("node:test");
const assert = require("node:assert/strict");
const {
  APPLY_CONFIRMATION,
  executeApplyWithBackup,
  parseArgs,
  resolveProjects,
} = require("../scripts/enrichGovProjectDocuments");

test("CLI is dry-run by default and requires one explicit source", () => {
  const options = parseArgs(["--source", "local"]);
  assert.equal(options.apply, false);
  assert.equal(options.source, "local");
  assert.throws(() => parseArgs([]), /exactly one/);
  assert.throws(
    () => parseArgs(["--source", "local", "--project-id", "68059426756"]),
    /exactly one/
  );
});

test("apply requires the exact confirmation and Mongo all is explicit", () => {
  assert.throws(
    () => parseArgs(["--source", "local", "--apply"]),
    /Refusing writes/
  );
  assert.doesNotThrow(() =>
    parseArgs([
      "--source",
      "local",
      "--apply",
      "--confirm",
      APPLY_CONFIRMATION,
    ])
  );
  assert.throws(
    () => parseArgs(["--source", "mongo"]),
    /requires --limit or explicit --all/
  );
  assert.doesNotThrow(() => parseArgs(["--source", "mongo", "--all"]));
});

test("CLI rejects out-of-range delays", () => {
  assert.throws(
    () => parseArgs(["--source", "local", "--delay-ms", "5001"]),
    /delayMs/
  );
  assert.doesNotThrow(() =>
    parseArgs(["--source", "local", "--delay-ms", "0"])
  );
});

test("local source preserves provider order and reports missing records", async () => {
  const existing = {
    _id: "mongo-id",
    project_id: "64117010720",
    documents: {},
  };
  const collection = {
    find(filter) {
      assert.deepEqual(filter, {
        project_id: { $in: ["65077164290", "64117010720"] },
      });
      return { toArray: async () => [existing] };
    },
  };
  const resolved = await resolveProjects(
    { source: "local", projectId: null, limit: null },
    {
      collection,
      getLocalFilteredProjects: async () => [
        { project_id: "65077164290" },
        { project_id: "64117010720" },
        { project_id: "65077164290" },
      ],
    }
  );
  assert.deepEqual(resolved.projects, [existing]);
  assert.deepEqual(resolved.missingProjectIds, ["65077164290"]);
  assert.deepEqual(resolved.sourceSummary, {
    source: "local",
    candidates: 3,
    unique: 2,
    existing: 1,
    missing: 1,
  });
});

test("backup failure prevents the first database write", async () => {
  let writeCount = 0;
  const plans = [
    {
      projectId: "68059426756",
      changedPaths: ["documents.invitation"],
      priorDocuments: {},
      operation: {
        updateOne: {
          filter: { project_id: "68059426756" },
          update: { $set: { "documents.invitation": { status: "not_found" } } },
          upsert: false,
        },
      },
    },
  ];
  await assert.rejects(
    () =>
      executeApplyWithBackup(plans, {
        writeBackup: async () => {
          throw new Error("backup unavailable");
        },
        updateOne: async () => {
          writeCount += 1;
          return { matchedCount: 1, modifiedCount: 1 };
        },
      }),
    /backup unavailable/
  );
  assert.equal(writeCount, 0);
});

test("successful apply creates backup before writes", async () => {
  const order = [];
  const plans = [
    {
      projectId: "68059426756",
      changedPaths: ["documents.invitation"],
      priorDocuments: {},
      operation: {
        updateOne: {
          filter: { project_id: "68059426756" },
          update: { $set: { "documents.invitation": { status: "not_found" } } },
          upsert: false,
        },
      },
    },
  ];
  const result = await executeApplyWithBackup(plans, {
    writeBackup: async () => {
      order.push("backup");
      return "backup.json";
    },
    updateOne: async () => {
      order.push("write");
      return { matchedCount: 1, modifiedCount: 1 };
    },
    verify: async () => {
      order.push("verify");
      return [{ projectId: "68059426756", verified: true }];
    },
  });
  assert.deepEqual(order, ["backup", "write", "verify"]);
  assert.equal(result.backupPath, "backup.json");
  assert.equal(result.apply.matched, 1);
});

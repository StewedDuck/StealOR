const test = require("node:test");
const assert = require("node:assert/strict");
const {
  APPLY_CONFIRMATION,
  executeApplyWithBackup,
  parseArgs,
  requestDiagnosticsDelta,
  resolveProjects,
  run,
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

test("request diagnostics report counters for only the current run", () => {
  const before = {
    egpRequestsTotal: 100,
    rateLimitResponses: 4,
    rateLimitRetries: 3,
    successfulRetries: 2,
    retryExhaustionCount: 1,
    globalCooldownCount: 4,
    globalCooldownMs: 70_000,
    exhaustionRecoveryAttempts: 1,
    successfulExhaustionRecoveries: 1,
    rateLimitResponsesByEndpoint: {
      "GET /approval/final": 4,
    },
    retryExhaustionsByEndpoint: {},
  };
  const after = {
    ...before,
    egpRequestsTotal: 112,
    rateLimitResponses: 6,
    rateLimitRetries: 5,
    successfulRetries: 4,
    exhaustionRecoveryAttempts: 3,
    successfulExhaustionRecoveries: 2,
    rateLimitResponsesByEndpoint: {
      "GET /approval/final": 5,
      "GET /announcement/greenBook": 1,
    },
    retryExhaustionsByEndpoint: {
      "GET /announcement/greenBook": 1,
    },
    currentRequestIntervalMs: 2_000,
    cooldownRemainingMs: 0,
  };

  assert.deepEqual(requestDiagnosticsDelta(before, after), {
    egpRequestsTotal: 12,
    rateLimitResponses: 2,
    rateLimitRetries: 2,
    successfulRetries: 2,
    retryExhaustionCount: 0,
    globalCooldownCount: 0,
    globalCooldownMs: 0,
    exhaustionRecoveryAttempts: 2,
    successfulExhaustionRecoveries: 1,
    rateLimitResponsesByEndpoint: {
      "GET /approval/final": 1,
      "GET /announcement/greenBook": 1,
    },
    retryExhaustionsByEndpoint: {
      "GET /announcement/greenBook": 1,
    },
    currentRequestIntervalMs: 2_000,
    cooldownRemainingMs: 0,
  });
  assert.equal(requestDiagnosticsDelta(null, null), null);
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

test("runner applies a category recovered by the bounded rate-limit post-pass", async () => {
  const projectId = "69099444939";
  const project = { _id: "mongo-id", project_id: projectId, documents: {} };
  let discoveryCalls = 0;
  let writtenDocuments = null;
  let disconnected = false;
  const collection = {
    find() {
      return {
        sort() {
          return this;
        },
        async toArray() {
          return [project];
        },
      };
    },
    async updateOne(_filter, update) {
      writtenDocuments = Object.fromEntries(
        Object.entries(update.$set)
          .filter(([key]) => key.startsWith("documents."))
          .map(([key, value]) => [key.slice("documents.".length), value])
      );
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async findOne() {
      return { documents: writtenDocuments };
    },
  };
  const originalLog = console.log;
  console.log = () => {};
  try {
    const output = await run(
      [
        "--source",
        "mongo",
        "--all",
        "--apply",
        "--confirm",
        APPLY_CONFIRMATION,
      ],
      {
        mongoUri: "mongodb://test.invalid/database",
        mongoose: {
          connect: async () => {},
          disconnect: async () => {
            disconnected = true;
          },
        },
        GovProject: { collection },
        postPassCooldownMs: 0,
        getEgpDiagnostics: () => ({ cooldownRemainingMs: 0 }),
        async discoverProjectDocuments() {
          discoveryCalls += 1;
          return {
            documents: {
              priceEstimate: { status: "not_found" },
              invitation:
                discoveryCalls === 1
                  ? {
                      status: "error",
                      error: {
                        code: "EGP_RATE_LIMITED",
                        kind: "rate_limited",
                        message: "e-GP rate limit exceeded",
                      },
                    }
                  : {
                      status: "available",
                      source: "national_egp",
                      lookupMethod: "invitation_approval_final",
                      downloadMethod: "file_id",
                      fileId: "recovered-file-id",
                      fileName: `${projectId}.zip`,
                    },
              draftEbidding: { status: "not_found" },
              selectedProcurementDocument: null,
            },
          };
        },
        fs: {
          mkdir: async () => {},
          writeFile: async () => {},
        },
        backupDirectory: "test-backups",
        now: () => new Date("2026-10-07T00:00:00.000Z"),
      }
    );

    assert.equal(discoveryCalls, 2);
    assert.equal(output.postPass.postPassRecovered, 1);
    assert.equal(output.postPass.postPassStillFailed, 0);
    assert.equal(writtenDocuments.invitation.status, "available");
    assert.equal(writtenDocuments.invitation.fileId, "recovered-file-id");
    assert.equal(writtenDocuments.selectedProcurementDocument, "invitation");
    assert.equal(output.verification[0].verified, true);
  } finally {
    console.log = originalLog;
  }
  assert.equal(disconnected, true);
});

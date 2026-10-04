// Tests the CLI safety contract, read-only MongoDB selection, dry-run
// behavior, explicit apply confirmation, and sequential batch reporting.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  APPLY_CONFIRMATION,
  PROJECT_PROJECTION,
  createDryRunReport,
  executeProjects,
  parseArgs,
  resolveProjects,
  run,
} = require("../scripts/extractGovProjectDocuments");

test("CLI is dry-run by default and requires an explicit selection", () => {
  const options = parseArgs(["--project-id", "68059426756"]);
  assert.equal(options.apply, false);
  assert.equal(options.projectId, "68059426756");
  assert.throws(() => parseArgs([]), /exactly one/);
  assert.throws(
    () =>
      parseArgs([
        "--project-id",
        "68059426756",
        "--source",
        "mongo",
        "--limit",
        "1",
      ]),
    /exactly one/
  );
});

test("Mongo batch selection requires limit or explicit all", () => {
  assert.throws(
    () => parseArgs(["--source", "mongo"]),
    /requires --limit or explicit --all/
  );
  assert.doesNotThrow(() =>
    parseArgs(["--source", "mongo", "--limit", "5"])
  );
  assert.doesNotThrow(() => parseArgs(["--source", "mongo", "--all"]));
  assert.throws(
    () => parseArgs(["--source", "mongo", "--limit", "5", "--all"]),
    /either --limit or --all/
  );
});

test("apply requires the exact confirmation phrase", () => {
  assert.throws(
    () => parseArgs(["--project-id", "68059426756", "--apply"]),
    /Refusing downloads and writes/
  );
  assert.doesNotThrow(() =>
    parseArgs([
      "--project-id",
      "68059426756",
      "--apply",
      "--confirm",
      APPLY_CONFIRMATION,
    ])
  );
  assert.throws(
    () =>
      parseArgs([
        "--project-id",
        "68059426756",
        "--confirm",
        APPLY_CONFIRMATION,
      ]),
    /valid only with --apply/
  );
});

test("dry-run planning performs no adapter calls or filesystem writes", () => {
  let adapterCalls = 0;
  let filesystemWrites = 0;
  const forbiddenDependencies = {
    adapter: {
      downloadDocument() {
        adapterCalls += 1;
        throw new Error("dry-run attempted a download");
      },
    },
    fs: {
      writeFile() {
        filesystemWrites += 1;
        throw new Error("dry-run attempted a write");
      },
    },
  };
  const options = parseArgs(["--project-id", "68059426756"]);
  const report = createDryRunReport(
    [
      {
        project_id: "68059426756",
        documents: {
          invitation: {
            status: "available",
            downloadMethod: "file_id",
            fileId: "invitation-id",
            fileName: "invitation.zip",
          },
        },
      },
    ],
    options,
    forbiddenDependencies
  );

  assert.equal(report.mode, "dry-run");
  assert.equal(report.summary.usableCategories, 1);
  assert.equal(adapterCalls, 0);
  assert.equal(filesystemWrites, 0);
});

test("explicit and limited Mongo selections use narrow read-only queries", async () => {
  const project = { _id: "mongo-id", project_id: "68059426756", documents: {} };
  const explicitCollection = {
    async findOne(filter, options) {
      assert.deepEqual(filter, { project_id: "68059426756" });
      assert.deepEqual(options, { projection: PROJECT_PROJECTION });
      return project;
    },
  };
  const explicit = await resolveProjects(
    parseArgs(["--project-id", "68059426756"]),
    { collection: explicitCollection }
  );
  assert.deepEqual(explicit.projects, [project]);
  assert.deepEqual(explicit.missingProjectIds, []);

  const calls = [];
  const cursor = {
    sort(value) {
      calls.push(["sort", value]);
      return this;
    },
    limit(value) {
      calls.push(["limit", value]);
      return this;
    },
    async toArray() {
      calls.push(["toArray"]);
      return [project];
    },
  };
  const batchCollection = {
    find(filter, options) {
      calls.push(["find", filter, options]);
      return cursor;
    },
  };
  const limited = await resolveProjects(
    parseArgs(["--source", "mongo", "--limit", "5"]),
    { collection: batchCollection }
  );
  assert.deepEqual(limited.projects, [project]);
  assert.deepEqual(calls, [
    ["find", {}, { projection: PROJECT_PROJECTION }],
    ["sort", { project_id: 1 }],
    ["limit", 5],
    ["toArray"],
  ]);
});

test("apply execution continues after a project-level failure", async () => {
  const projects = [
    { project_id: "68059426756", documents: {} },
    { project_id: "65077164290", documents: {} },
  ];
  const processed = [];
  const result = await executeProjects(
    projects,
    {
      tempRoot: "C:\\temporary-phase-b",
      force: true,
      redownload: true,
    },
    {
      async processProjectDocumentExtractions(project, options) {
        processed.push([project.project_id, options]);
        if (project.project_id === "68059426756") {
          throw new Error("injected project failure");
        }
        return {
          projectId: project.project_id,
          categories: [],
          summary: { extracted: 1, skipped: 1, failed: 1 },
        };
      },
    }
  );

  assert.equal(processed.length, 2);
  assert.equal(result.summary.failedProjects, 1);
  assert.equal(result.summary.processedProjects, 1);
  assert.equal(result.summary.extractedCategories, 1);
  assert.equal(result.summary.skippedCategories, 1);
  assert.equal(result.summary.failedCategories, 1);
  assert.equal(result.reports[0].outcome, "failed");
  assert.equal(result.reports[1].projectId, "65077164290");
});

test("run dry-run reads MongoDB but never invokes extraction or writes MongoDB", async () => {
  const events = [];
  const project = {
    _id: "mongo-id",
    project_id: "68059426756",
    documents: {
      invitation: {
        status: "available",
        downloadMethod: "file_id",
        fileId: "invitation-id",
        fileName: "invitation.zip",
      },
    },
  };
  const output = await run(["--project-id", "68059426756"], {
    mongoUri: "mongodb://test.invalid/stealor",
    mongoose: {
      async connect(uri) {
        events.push(["connect", uri]);
      },
      async disconnect() {
        events.push(["disconnect"]);
      },
    },
    GovProject: {
      collection: {
        async findOne() {
          events.push(["findOne"]);
          return project;
        },
        updateOne() {
          throw new Error("Phase B must not write MongoDB");
        },
      },
    },
    async processProjectDocumentExtractions() {
      throw new Error("dry-run must not execute extraction");
    },
    log(value) {
      events.push(["log", value]);
    },
  });

  assert.equal(output.mode, "dry-run");
  assert.equal(output.summary.usableCategories, 1);
  assert.equal(output.exitCode, 0);
  assert.deepEqual(
    events.map(([event]) => event),
    ["connect", "findOne", "log", "disconnect"]
  );
});

test("confirmed run applies sequential extraction and reports partial failure", async () => {
  const projects = [
    { project_id: "65077164290", documents: {} },
    { project_id: "68059426756", documents: {} },
  ];
  const events = [];
  const cursor = {
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    async toArray() {
      return projects;
    },
  };
  const output = await run(
    [
      "--source",
      "mongo",
      "--limit",
      "2",
      "--apply",
      "--confirm",
      APPLY_CONFIRMATION,
      "--force",
      "--redownload",
    ],
    {
      mongoUri: "mongodb://test.invalid/stealor",
      tempRoot: "C:\\phase-b-test-temp",
      mongoose: {
        async connect() {
          events.push("connect");
        },
        async disconnect() {
          events.push("disconnect");
        },
      },
      GovProject: {
        collection: {
          find() {
            return cursor;
          },
          updateOne() {
            throw new Error("Phase B must not write MongoDB");
          },
        },
      },
      async processProjectDocumentExtractions(project, options) {
        events.push(project.project_id);
        assert.equal(options.tempRoot, "C:\\phase-b-test-temp");
        assert.equal(options.force, true);
        assert.equal(options.redownload, true);
        return {
          projectId: project.project_id,
          categories: [],
          summary:
            project.project_id === "65077164290"
              ? { extracted: 0, skipped: 2, failed: 1 }
              : { extracted: 2, skipped: 1, failed: 0 },
        };
      },
      log() {},
    }
  );

  assert.equal(output.mode, "apply");
  assert.equal(output.summary.processedProjects, 2);
  assert.equal(output.summary.extractedCategories, 2);
  assert.equal(output.summary.skippedCategories, 3);
  assert.equal(output.summary.failedCategories, 1);
  assert.equal(output.exitCode, 1);
  assert.deepEqual(events, [
    "connect",
    "65077164290",
    "68059426756",
    "disconnect",
  ]);
});

test("missing explicit projects are reported without invoking extraction", async () => {
  let processCount = 0;
  const output = await run(["--project-id", "68059426756"], {
    mongoUri: "mongodb://test.invalid/stealor",
    mongoose: {
      async connect() {},
      async disconnect() {},
    },
    GovProject: {
      collection: {
        async findOne() {
          return null;
        },
      },
    },
    async processProjectDocumentExtractions() {
      processCount += 1;
    },
    log() {},
  });

  assert.equal(processCount, 0);
  assert.deepEqual(output.missingProjectIds, ["68059426756"]);
  assert.equal(output.projects[0].outcome, "missing");
});

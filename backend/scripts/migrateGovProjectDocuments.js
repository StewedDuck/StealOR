require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const GovProject = require("../src/models/GovProject");
const {
  buildGovProjectDocumentMigrationPlan,
} = require("../src/services/govProjectDocumentMigrationService");

const APPLY_CONFIRMATION = "APPLY_GOV_PROJECT_DOCUMENTS_MIGRATION";

async function run() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.CONFIRM_GOV_DOCUMENT_MIGRATION !== APPLY_CONFIRMATION) {
    throw new Error(
      `Refusing writes: set CONFIRM_GOV_DOCUMENT_MIGRATION=${APPLY_CONFIRMATION}`
    );
  }
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const projects = await GovProject.collection
      .find(
        {},
        {
          projection: {
            project_id: 1,
            documentExtraction: 1,
            documents: 1,
          },
        }
      )
      .toArray();
    const plan = buildGovProjectDocumentMigrationPlan(projects);

    if (!apply) {
      console.log(
        JSON.stringify(
          {
            mode: "dry-run",
            summary: plan.summary,
            sampleOperations: plan.operations.slice(0, 3),
          },
          null,
          2
        )
      );
      return;
    }
    if (plan.operations.length === 0) {
      console.log(JSON.stringify({ mode: "apply", summary: plan.summary }, null, 2));
      return;
    }

    // Back up every field touched or consulted before the first database write.
    const backupDirectory = path.join(__dirname, "..", "backups");
    await fs.mkdir(backupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(
      backupDirectory,
      `gov-project-documents-${timestamp}.json`
    );
    await fs.writeFile(
      backupPath,
      JSON.stringify({ createdAt: new Date(), records: plan.backups }, null, 2),
      "utf8"
    );

    const result = await GovProject.bulkWrite(plan.operations, { ordered: false });
    const ids = plan.backups.map(({ _id }) => _id).filter(Boolean);
    const verified = await GovProject.collection.countDocuments({
      _id: { $in: ids },
      "documents.priceEstimate.status": "available",
    });
    if (verified !== plan.operations.length) {
      throw new Error(
        `Migration verification failed: expected ${plan.operations.length}, found ${verified}`
      );
    }

    console.log(
      JSON.stringify(
        {
          mode: "apply",
          summary: plan.summary,
          matched: result.matchedCount,
          modified: result.modifiedCount,
          verified,
          backupPath,
        },
        null,
        2
      )
    );
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { run };

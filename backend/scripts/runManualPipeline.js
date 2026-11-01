// backend/scripts/runManualPipeline.js
require("dotenv").config();
const mongoose = require("mongoose");
const { processProjectId } = require("../src/services/pipelineOrchestratorService");

const projectId = process.argv[2];

if (!projectId) {
  console.error("❌ Please provide a projectId. Example: node scripts/runManualPipeline.js 67119000332");
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    await processProjectId(projectId, { force: true });
  } finally {
    await mongoose.disconnect();
  }
}

main();
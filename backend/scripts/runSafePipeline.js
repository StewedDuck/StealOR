const { execSync } = require("child_process");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const GovProject = require("../src/models/GovProject"); 

const projectId = process.argv[2];

if (!projectId) {
  console.error("❌ Please provide a projectId. Example: node scripts/runSafePipeline.js 69069082556");
  process.exit(1);
}

const fs = require("fs");

async function insertProjectIfNotExists(id) {
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const exists = await GovProject.findOne({ project_id: id });
    if (!exists) {
      console.log(`\n▶️ STEP 0: Project ${id} not found in DB. Reading from projects.json...`);
      
      let localProject = {};
      try {
        const rawData = fs.readFileSync("projects.json", "utf-8");
        const parsed = JSON.parse(rawData);
        // ค้นหา Object ที่มี projectId ตรงกับรอบที่กำลังรัน
        localProject = parsed.data.find(item => String(item.projectId) === String(id)) || {};
      } catch (e) {
        console.warn(`⚠️ Could not read projects.json:`, e.message);
      }
      
      await GovProject.create({ 
        project_id: id, 
        project_name: localProject.projectName || localProject.project_name || `โครงการ ${id}`,
        dept_name: localProject.deptName || localProject.dept_name || "ไม่ระบุหน่วยงาน",
        budget_amount: Number(localProject.projectMoney || localProject.priceBuild || 0),
        sum_price_agree: 0,
        contract_status: "หนังสือเชิญชวน/ประกาศเชิญชวน",
      });
    } else {
      console.log(`\n▶️ STEP 0: Project ${id} already exists in DB. Proceeding...`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  console.log(`\n==================================================`);
  console.log(`🚀 [Safe Pipeline] Starting sequence for ID: ${projectId}`);
  console.log(`==================================================`);

  try {
    // Step 0: Ensure the project exists in MongoDB (so enrichment doesn't skip it)
    await insertProjectIfNotExists(projectId);

    // Step 1: Discover Document Links
    console.log(`\n▶️ STEP 1: Running enrichGovProjectDocuments.js...`);
    execSync(
      `node scripts/enrichGovProjectDocuments.js --project-id ${projectId} --apply --confirm APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT`,
      { stdio: "inherit" }
    );

    // Step 2: Download ZIP and Extract PDFs
    console.log(`\n▶️ STEP 2: Running extractGovProjectDocuments.js...`);
    execSync(
      `node scripts/extractGovProjectDocuments.js --project-id ${projectId} --apply --confirm EXTRACT_GOV_PROJECT_DOCUMENTS`,
      { stdio: "inherit" }
    );

    // Step 3: Classify PDFs and Extract Text to .txt files
    console.log(`\n▶️ STEP 3: Running classifyPdfs.js for ${projectId}...`);
    execSync(`node scripts/classifyPdfs.js ${projectId}`, { stdio: "inherit" });

    // Step 4: Run Gemini Analysis on the .txt files (Outputs to temp/procurement-analysis/)
    console.log(`\n▶️ STEP 4: Running analyzeProcurementTexts.js for ${projectId}...`);
    execSync(
      `node scripts/analyzeProcurementTexts.js --project-id ${projectId}`,
      { stdio: "inherit" }
    );

    // Step 5: Import the Analysis Result back into MongoDB
    console.log(`\n▶️ STEP 5: Running importProcurementAnalysis.js for ${projectId}...`);
    execSync(
      `node scripts/importProcurementAnalysis.js --project-id ${projectId} --apply --confirm APPLY_PROCUREMENT_ANALYSIS_IMPORT`,
      { stdio: "inherit" }
    );

    console.log(`\n✅ Safe Pipeline finished for ${projectId}. Analysis is now live in DB.`);
  } catch (error) {
    console.error(`\n❌ Pipeline failed during execution.`, error.message);
  }
}

main();
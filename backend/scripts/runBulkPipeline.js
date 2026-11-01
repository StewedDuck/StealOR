const { execSync } = require("child_process");
const fs = require("fs");

// Read the IDs from the text file and split into an array
const ids = fs.readFileSync("test_ids.txt", "utf-8").split("\n").map(id => id.trim()).filter(id => id.length === 11);

console.log(`Found ${ids.length} projects to process.`);

for (const projectId of ids) {
  try {
    console.log(`\n\n🟢 Starting Bulk Process for: ${projectId}`);
    // Calls the safe wrapper we created earlier
    execSync(`node scripts/runSafePipeline.js ${projectId}`, { stdio: "inherit" });
  } catch (err) {
    console.error(`❌ Failed on ${projectId}, moving to next...`);
  }
}
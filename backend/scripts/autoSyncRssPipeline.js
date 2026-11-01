// backend/scripts/autoSyncRssPipeline.js
require("dotenv").config();
const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
const mongoose = require("mongoose");
const { fetchEgpRssAnnouncements } = require("../src/services/egp/egpRssService");
const { processProjectId } = require("../src/services/pipelineOrchestratorService");

function getTodayCE() {
  const d = new Date();
  const yyyy = d.getFullYear(); // Uses Common Era per the official manual
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function pollOnce() {
  const dateStr = getTodayCE();
  console.log(`\n📡 [RSS Poller] Polling announcements for CE date: ${dateStr}...`);

  // Check Draft TORs (Bo) and Invitations (Do)
  const draftTors = await fetchEgpRssAnnouncements({ anounceType: "Bo", announceDate: dateStr }).catch(() => []);
  const invitations = await fetchEgpRssAnnouncements({ anounceType: "Do", announceDate: dateStr }).catch(() => []);
  const items = [...draftTors, ...invitations];

  console.log(`Found ${items.length} total announcements.`);

  for (const item of items) {
    if (!item.projectId) continue;

    // Filter Bangkok projects
    const isBkk = (item.title && item.title.includes("กรุงเทพ")) ||
                  (item.raw?.description && item.raw.description.includes("กรุงเทพ"));

    if (isBkk) {
      console.log(`🎯 Matched Bangkok announcement: ${item.projectId} - ${item.title.slice(0, 40)}`);
      try {
        await processProjectId(item.projectId);
      } catch (err) {
        console.error(`❌ Failed processing ${item.projectId}: ${err.message}`);
      }
    }
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB. Starting poller...");
  
  // Run once immediately, then poll periodically
  await pollOnce();

  // Poll every 30 minutes
  setInterval(pollOnce, 30 * 60 * 1000);
}

main();
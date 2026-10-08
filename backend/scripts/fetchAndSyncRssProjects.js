require("dotenv").config();
const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const mongoose = require("mongoose");
const { fetchEgpRssAnnouncements } = require("../src/services/egp/egpRssService");
const { fetchProjectDetails } = require("../src/services/govSpendingService");
const { enrichAndSaveProjects } = require("../src/services/govProjectBatchImportService");

// Formats a Date object to YYYYMMDD in Buddhist Era (BE) without slashes
function formatDateToYYYYMMDD(date) {
  const yyyy = date.getFullYear() + 543; // Convert to BE (e.g., 2569)
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`; // Results in 25691004, 25691003, etc.
}

// Helper to retry fetching if we get rate limited (HTTP 429)
async function fetchWithRetry(options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchEgpRssAnnouncements(options);
    } catch (err) {
      if (err.message.includes("429")) {
        console.warn(`⏳ Rate limit (429) hit on ${options.anounceType}. Cooling down for 30 seconds... (Retry ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30-second cooldown
      } else {
        console.warn(`⚠️ Error on ${options.anounceType}: ${err.message}`);
        return [];
      }
    }
  }
  return []; // Return empty if all retries fail
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("❌ MONGODB_URI is missing from .env");
    process.exit(1);
  }

  console.log("Connecting to MongoDB Atlas...");
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB Atlas.");

  const TARGET_COUNT = 100;
  const enrichedBangkokProjects = [];
  const seenProjectIds = new Set();

  // === SET YOUR CUSTOM START DATE HERE ===
  // Starting from June 3, 2026 to skip the days we already scanned
  const currentDate = new Date("2026-10-04T00:00:00");

  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 4);

  console.log(`Starting RSS crawl from: ${formatDateToYYYYMMDD(currentDate)}`);
  console.log(`Target: ${TARGET_COUNT} Bangkok projects.`);
  console.log(`Softcap cutoff date: ${formatDateToYYYYMMDD(cutoffDate)}`);

  try {
    while (enrichedBangkokProjects.length < TARGET_COUNT && currentDate >= cutoffDate) {
      const dateString = formatDateToYYYYMMDD(currentDate);
      const fiscalYearBE = currentDate.getFullYear() + 543;

      console.log(`\n--- Scanning Date: ${dateString} ---`);

      // 1. Fetch sequentially with a retry mechanism for rate limits
      const draftTors = await fetchWithRetry({ anounceType: "Bo", announceDate: dateString });
      await new Promise(resolve => setTimeout(resolve, 3000)); // Polite 3-second delay
      
      const invitations = await fetchWithRetry({ anounceType: "Do", announceDate: dateString });
      await new Promise(resolve => setTimeout(resolve, 3000)); // Polite 3-second delay before GovSpending

      const dailyItems = [...draftTors, ...invitations];
      console.log(`Found ${dailyItems.length} announcements across Thailand for ${dateString}.`);

      // 2. Filter for unique Bangkok projects
      for (const item of dailyItems) {
        if (enrichedBangkokProjects.length >= TARGET_COUNT) break;
        if (!item.projectId || seenProjectIds.has(item.projectId)) continue;

        seenProjectIds.add(item.projectId);

        try {
          const spendingData = await fetchProjectDetails(fiscalYearBE, item.projectId);
          const projectData = spendingData?.result?.[0] || {};

          const isBangkok =
            (projectData.province && projectData.province.includes("กรุงเทพ")) ||
            (projectData.dept_name && projectData.dept_name.includes("กรุงเทพ")) ||
            (item.title && item.title.includes("กรุงเทพ"));

          if (isBangkok) {
            console.log(
              `✅ [Match #${enrichedBangkokProjects.length + 1}] ID: ${item.projectId} | ${item.title.slice(0, 50)}...`
            );

            enrichedBangkokProjects.push({
              project_id: item.projectId,
              project_name: projectData.project_name || item.title,
              dept_name: projectData.dept_name || "กรุงเทพมหานคร",
              dept_code: projectData.dept_code || null,
              budget_amount: projectData.budget_total || projectData.budget_amount || 0,
              sum_price_agree: projectData.sum_price_agree || 0,
              contract_status:
                projectData.contract_status ||
                (item.title.includes("ร่าง") ? "ร่าง TOR" : "หนังสือเชิญชวน/ประกาศเชิญชวน"),
              winner_name: projectData.winner_name || null,
              winner_tin: projectData.winner_tin || null,
              ...projectData,
            });
          }
        } catch (err) {
          if (item.title && item.title.includes("กรุงเทพ")) {
            console.log(`✅ [Match from Title #${enrichedBangkokProjects.length + 1}] ID: ${item.projectId}`);
            enrichedBangkokProjects.push({
              project_id: item.projectId,
              project_name: item.title,
              dept_name: "กรุงเทพมหานคร",
              contract_status: item.title.includes("ร่าง") ? "ร่าง TOR" : "หนังสือเชิญชวน/ประกาศเชิญชวน",
            });
          }
        }
      }

      // Step back 1 day
      currentDate.setDate(currentDate.getDate() - 1);
    }

    if (currentDate < cutoffDate) {
      console.log(`\n🛑 Reached the 4-year softcap cutoff (${formatDateToYYYYMMDD(cutoffDate)}). Stopping scan.`);
    }

    console.log(`\n🎉 Total Bangkok projects collected: ${enrichedBangkokProjects.length}`);

    if (enrichedBangkokProjects.length > 0) {
      console.log("Extracting PDF text and saving records into MongoDB 'govprojects'...");
      const importStats = await enrichAndSaveProjects(enrichedBangkokProjects);
      console.log("✨ Import finished successfully:", importStats);
    } else {
      console.log("No matching projects found to save.");
    }
  } catch (error) {
    console.error("❌ Fatal error occurred during sync:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB.");
  }
}

main();
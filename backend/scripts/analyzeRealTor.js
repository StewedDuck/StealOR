
require("dotenv").config();

const mongoose = require("mongoose");

const GovProject = require("../src/models/GovProject");
const TorAnalysis = require("../src/models/TorAnalysis");
const { analyzeTor } = require("../src/services/torAnalyzer");

async function main() {
    const mongoUri = process.env.MONGODB_URI;
    const torId = process.env.TOR_ID;
    const shouldSave = process.env.SAVE_ANALYSIS === "true";

    if (!mongoUri) {
        throw new Error("MONGODB_URI is missing");
    }

    if (!torId || !mongoose.isValidObjectId(torId)) {
        throw new Error(
            "Please provide a valid TOR_ID"
        );
    }

    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");

    // เลือก TOR ตาม ID ที่ระบุเท่านั้น
    const tor = await GovProject.findById(torId);

    if (!tor) {
        throw new Error("Government TOR not found");
    }

    if (!tor.procurementAnalysis) {
        throw new Error(
            "This TOR has no procurementAnalysis"
        );
    }

    console.log("\n=== SELECTED TOR ===");
    console.log("MongoDB ID:", tor._id.toString());
    console.log("Project ID:", tor.project_id);
    console.log("Project Name:", tor.project_name);

    // วิเคราะห์ TOR ด้วย Prompt ใหม่
    console.log("\nAnalyzing TOR...");
    const result = await analyzeTor(tor, "government");

    const mandatory = result.requirements.filter(
        (item) => item.category === "mandatory"
    );

    const scored = result.requirements.filter(
        (item) => item.category === "scored"
    );

    const unclear = result.requirements.filter(
        (item) => item.category === "unclear"
    );

    const notApplicable = result.requirements.filter(
        (item) => item.category === "not_applicable"
    );

    console.log("\n=== ANALYSIS SUMMARY ===");
    console.log("Status:", result.status);
    console.log("Scoring Status:", result.scoringStatus);
    console.log("Total Requirements:", result.requirements.length);
    console.log("Mandatory:", mandatory.length);
    console.log("Scored:", scored.length);
    console.log("Unclear:", unclear.length);
    console.log("Not Applicable:", notApplicable.length);

    console.log("\n=== REQUIREMENTS ===");

    for (const item of result.requirements) {
        console.log(
            `[${item.category.toUpperCase()}] ${item.text}`
        );
        console.log("  Profile Field:", item.profileField);
        console.log("  Weight:", item.weight);
        console.log("  Reason:", item.reason);
        console.log("  Source:", item.sourceText);
    }

    console.log("\n=== PROJECT RELEVANCE SUMMARY ===");
    console.log("Relevance Status:", result.relevanceStatus);
    console.log(
        "Total Relevance Criteria:",
        result.projectRelevance?.length ?? 0
    );

    console.log("\n=== PROJECT RELEVANCE CRITERIA ===");

    for (const [index, item] of (result.projectRelevance || []).entries()) {
        console.log(`\n${index + 1}. ${item.text}`);
        console.log("  Skill Keywords:", item.skillKeywords);
        console.log("  Profile Fields:", item.profileFields);
        console.log("  Source:", item.sourceText);
        console.log("  Reason:", item.reason);
        console.log("  Weight:", item.weight);
        console.log("  Confidence:", item.confidence);
    }


    if (!shouldSave) {
        console.log("\n=== PREVIEW ONLY ===");
        console.log(
            "Analysis was NOT saved to MongoDB."
        );
        return;
    }

    // บันทึกเฉพาะเมื่อเปิด SAVE_ANALYSIS=true
    const saved = await TorAnalysis.findOneAndUpdate(
        {
            torSource: "government",
            torId: tor._id,
        },
        {
            $set: {
                status: result.status,
                requirements: result.requirements,
                projectRelevance: result.projectRelevance,
                scoringStatus: result.scoringStatus,
                relevanceStatus: result.relevanceStatus,
                modelName: result.modelName,
                analyzedAt: result.analyzedAt,
                error: null,
            },
        },
        {
            upsert: true,
            returnDocument: "after",
            runValidators: true,
        }
    );

    console.log("\n=== SAVED TO MONGODB ===");
    console.log("TorAnalysis ID:", saved._id.toString());
    console.log("Linked GovProject ID:", saved.torId.toString());
}

main()
    .catch((error) => {
        console.error("\nError:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });


require("dotenv").config();

const mongoose = require("mongoose");
const GovProject = require("../src/models/GovProject");
const User = require("../src/models/User");
const TorAnalysis = require("../src/models/TorAnalysis");
const { calculateMatching } = require("../src/services/torMatchingService");

async function main() {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
        throw new Error("MONGODB_URI is missing from .env");
    }

    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");

    // 1. Get the analyzed Government TOR.
    const torAnalysis = await TorAnalysis.findOne({
        torSource: "government",
        torId: new mongoose.Types.ObjectId(
            "6ac2e0865483a9b90c786ec4"
        ),
    });

    if (!torAnalysis) {
        throw new Error("TOR analysis not found");
    }

    // 2. Get the original Government TOR.
    const govProject = await GovProject.findById(
        torAnalysis.torId
    );

    if (!govProject) {
        throw new Error("Government TOR not found");
    }

    // 3. Read the bidding closing date from the TOR database.
    const closingDate =
        govProject.procurementAnalysis?.biddingClosingDate;

    const biddingClosingDate =
        closingDate?.dateTime || closingDate?.date || null;

    // Do not assume the closing date is the actual submission date.
    // Do not guess the required financial statement year.
    const options = {
        bidSubmissionDate: null,
        requiredFinancialYear: null,
    };

    console.log("\n=== TOR DATE INFORMATION ===");
    console.log({
        biddingClosingDate,
        requiredFinancialYear: options.requiredFinancialYear,
    });

    // 4. Get the contractor profile.
    const userId = process.env.TEST_MATCHING_USER_ID;

    if (!userId || !mongoose.isValidObjectId(userId)) {
        throw new Error(
            "Please provide a valid TEST_MATCHING_USER_ID"
        );
    }

    const contractor = await User.findOne({
        _id: userId,
        accountRole: {
            $in: ["contractor", "project_owner"],
        },
    });

    if (!contractor) {
        throw new Error("No contractor found in MongoDB");
    }

    console.log("Role:", contractor.accountRole);

    // 5. Display TOR analysis.
    console.log("\n=== TOR ANALYSIS ===");
    console.log("TOR ID:", torAnalysis.torId.toString());
    console.log("Status:", torAnalysis.status);
    console.log(
        "Requirements:",
        torAnalysis.requirements.length
    );

    // 6. Display Net Worth requirements.
    console.log("\n=== NET WORTH REQUIREMENTS ===");

    for (const requirement of torAnalysis.requirements) {
        if (
            /net value|net worth|financial statement|registered for more than/i.test(
                requirement.text
            )
        ) {
            console.log({
                text: requirement.text,
                profileField: requirement.profileField,
                category: requirement.category,
                operator: requirement.operator,
                value: requirement.value,
                minimumValue: requirement.minimumValue,
            });
        }
    }

    // 7. Display past project requirements.
    console.log("\n=== PAST PROJECT PROFILE FIELDS ===");

    for (const requirement of torAnalysis.requirements) {
        if (
            /past project|project contract|same type/i.test(
                requirement.text
            )
        ) {
            console.log({
                text: requirement.text,
                profileField: requirement.profileField,
                category: requirement.category,
            });
        }
    }

    // 8. Display contractor information.
    console.log("\n=== CONTRACTOR ===");
    console.log("Contractor ID:", contractor._id.toString());
    console.log("Name:", contractor.name);
    console.log("Email:", contractor.email);
    console.log(
        "Company:",
        contractor.company || "Not provided"
    );
    console.log("Skills:", contractor.skills);
    console.log(
        "Past Projects:",
        contractor.pastProjects?.length ?? 0
    );
    console.log(
        "Team Qualifications:",
        contractor.teamQualifications?.length ?? 0
    );

    console.log("\n=== CONTRACTOR NET WORTH ===");
    console.log({
        companyRegistrationDate:
            contractor.legalEligibility?.companyRegistrationDate ?? null,
        netWorth:
            contractor.legalEligibility?.netWorth ?? null,
        netWorthFinancialYear:
            contractor.legalEligibility?.netWorthFinancialYear ?? null,
    });

    // 9. Calculate matching.
    const result = await calculateMatching(
        contractor,
        torAnalysis,
        options
    );

    // 10. Display matching summary.
    console.log("\n=== MATCHING SUMMARY ===");
    console.log("Eligibility:", result.eligibility);
    console.log("Mandatory:", result.mandatorySummary);
    console.log(
        "Matching Percentage:",
        result.matchingPercentage
    );
    console.log("Scoring Status:", result.scoringStatus);
    console.log(
        "Meets 50% Threshold:",
        result.meetsDisplayThreshold
    );

    // 11. Display mandatory results.
    console.log("\n=== MANDATORY RESULTS ===");

    for (const item of result.mandatoryResults) {
        console.log(
            `[${item.status.toUpperCase()}] ${item.text}`
        );
        console.log(`Reason: ${item.reason}\n`);
    }

    // 12. Display scored results.
    console.log("\n=== SCORED RESULTS ===");

    for (const item of result.scoredResults) {
        console.log(
            `[${item.status.toUpperCase()}] ${item.text}`
        );
        console.log(
            `Weight: ${item.appliedWeight ?? "N/A"}%`
        );
        console.log(`Reason: ${item.reason}\n`);
    }
}

main()
    .catch((error) => {
        console.error("\nError:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });

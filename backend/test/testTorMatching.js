const test = require("node:test");
const assert = require("node:assert/strict");

const {
    calculateMatching,
} = require("../src/services/torMatchingService");

function createTorAnalysis(requiredContracts = 2) {
    return {
        torSource: "government",
        torId: "example-tor",
        status: "completed",
        requirements: [
            {
                text: `Must have at least ${requiredContracts} past project contracts`,
                category: "mandatory",
                profileField: "pastProjects",
                sourceText: "",
                weight: null,
            },
        ],
    };
}

async function checkContractMatching(projects, requiredContracts = 2) {
    const contractor = {
        pastProjects: projects,
    };

    const result = await calculateMatching(
        contractor,
        createTorAnalysis(requiredContracts)
    );

    return result.mandatoryResults[0];
}

test("PASS - contractor has enough contracts", async () => {
    const result = await checkContractMatching([
        {
            projectName: "Project A",
            hasContract: true,
            contractValue: 8000000,
        },
        {
            projectName: "Project B",
            hasContract: true,
            contractValue: 6000000,
        },
    ]);

    assert.equal(result.status, "pass");
});

test("FAIL - contractor does not have enough contracts", async () => {
    const result = await checkContractMatching([
        {
            projectName: "Project A",
            hasContract: true,
        },
        {
            projectName: "Project B",
            hasContract: false,
        },
    ]);

    assert.equal(result.status, "fail");
});

test("UNKNOWN - one contract status is missing", async () => {
    const result = await checkContractMatching([
        {
            projectName: "Project A",
            hasContract: true,
        },
        {
            projectName: "Project B",
            hasContract: null,
        },
    ]);

    assert.equal(result.status, "unknown");
});

test("UNKNOWN - no past projects are provided", async () => {
    const result = await checkContractMatching([]);

    assert.equal(result.status, "unknown");
});

test("FAIL - required contract count is greater than reported projects", async () => {
    const result = await checkContractMatching(
        [
            { projectName: "Project A", hasContract: true },
            { projectName: "Project B", hasContract: true },
        ],
        3
    );

    assert.equal(result.status, "fail");
});

test("FAIL - only one contract meets the minimum value", async () => {
    const tor = {
        torSource: "government",
        torId: "combined-test",
        status: "completed",
        requirements: [
            {
                text: "Must have at least 2 past project contracts",
                category: "mandatory",
                profileField: "pastProjects",
            },
            {
                text: "Minimum 5000000 baht",
                category: "mandatory",
                profileField: "pastProjects",
            },
        ],
    };

    const contractor = {
        pastProjects: [
            {
                projectName: "Project A",
                hasContract: true,
                contractValue: 8000000,
            },
            {
                projectName: "Project B",
                hasContract: true,
                contractValue: 3000000,
            },
        ],
    };

    const result = await calculateMatching(contractor, tor);

    assert.equal(result.eligibility, "ineligible");
    assert.equal(result.mandatorySummary.failed, 2);
});

test("UNKNOWN - contract value is missing", async () => {
    const tor = {
        torSource: "government",
        torId: "unknown-value-test",
        status: "completed",
        requirements: [
            {
                text: "Minimum 5000000 baht",
                category: "mandatory",
                profileField: "pastProjects",
            },
        ],
    };

    const contractor = {
        pastProjects: [
            {
                projectName: "Project A",
                hasContract: true,
                contractValue: null,
            },
        ],
    };

    const result = await calculateMatching(contractor, tor);

    assert.equal(result.eligibility, "unknown");
    assert.equal(result.mandatoryResults[0].status, "unknown");
});

function createLegalTor(text) {
    return {
        torSource: "government",
        torId: "legal-test",
        status: "completed",
        requirements: [
            {
                text,
                category: "mandatory",
                profileField: "legalEligibility",
            },
        ],
    };
}

async function checkLegal(text, legalEligibility) {
    const result = await calculateMatching(
        { legalEligibility },
        createLegalTor(text)
    );

    return result.mandatoryResults[0].status;
}

test("PASS - contractor has legal capacity", async () => {
    assert.equal(
        await checkLegal("Must have legal capacity", {
            legalCapacity: true,
        }),
        "pass"
    );
});

test("FAIL - contractor has no legal capacity", async () => {
    assert.equal(
        await checkLegal("Must have legal capacity", {
            legalCapacity: false,
        }),
        "fail"
    );
});

test("UNKNOWN - legal capacity is missing", async () => {
    assert.equal(
        await checkLegal("Must have legal capacity", {
            legalCapacity: null,
        }),
        "unknown"
    );
});

test("PASS - contractor has no conflict of interest", async () => {
    assert.equal(
        await checkLegal("No conflict of interest", {
            hasConflictOfInterest: false,
        }),
        "pass"
    );
});

test("FAIL - contractor has a conflict of interest", async () => {
    assert.equal(
        await checkLegal("No conflict of interest", {
            hasConflictOfInterest: true,
        }),
        "fail"
    );
});

test("PASS - contractor is registered in e-GP", async () => {
    assert.equal(
        await checkLegal("Must be registered in e-GP", {
            isEGPRegistered: true,
        }),
        "pass"
    );
});

test("PASS - contractor is not bankrupt", async () => {
    assert.equal(
        await checkLegal("Must not be bankrupt", {
            bankruptcyStatus: "no",
        }),
        "pass"
    );
});

test("UNKNOWN - unsupported legal requirement", async () => {
    assert.equal(
        await checkLegal("Must satisfy special legal conditions", {}),
        "unknown"
    );
});

test("REAL TOR - legally capable", async () => {
    assert.equal(
        await checkLegal("Must be legally capable.", {
            legalCapacity: true,
        }),
        "pass"
    );
});

test("REAL TOR - liquidation", async () => {
    assert.equal(
        await checkLegal("Must not be undergoing business liquidation.", {
            liquidationStatus: "no",
        }),
        "pass"
    );
});

test("REAL TOR - conflicts of interest", async () => {
    assert.equal(
        await checkLegal(
            "Must not have conflicts of interest with other bidders or act to hinder fair competition.",
            { hasConflictOfInterest: false }
        ),
        "pass"
    );
});

test("REAL TOR - anti-corruption policy", async () => {
    assert.equal(
        await checkLegal(
            "Must have a policy and guidelines for preventing corruption in procurement.",
            { hasAntiCorruptionPolicy: true }
        ),
        "pass"
    );
});

test("REAL TOR - integrity agreement", async () => {
    assert.equal(
        await checkLegal(
            "Must sign an integrity agreement for procurement projects with a budget of 1,000 million baht or more.",
            { hasSignedIntegrityAgreement: true }
        ),
        "pass"
    );
});

test("Net worth - must not use registered capital as net worth", async () => {
    const tor = {
        torSource: "government",
        torId: "net-worth-test",
        status: "completed",
        requirements: [
            {
                text: "For juristic persons registered for more than 1 year, the net value of the business must be positive from the financial statement of the last year before the submission date.",
                category: "mandatory",
                profileField: "registeredCapital",
            },
        ],
    };

    const contractor = {
        registeredCapital: 10000000,
        legalEligibility: {
            companyRegistrationDate: new Date("2020-01-01"),
            netWorth: -500000,
        },
    };

    const result = await calculateMatching(contractor, tor);

    assert.equal(result.mandatoryResults[0].status, "unknown");
});

const netWorthRequirement = {
    text: "For juristic persons registered for more than 1 year, the net value of the business must be positive from the financial statement of the last year before the submission date.",
    category: "mandatory",
    profileField: "netWorth",
};

const netWorthTor = {
    status: "completed",
    requirements: [netWorthRequirement],
};

function makeNetWorthContractor(overrides = {}) {
    return {
        legalEligibility: {
            companyRegistrationDate: new Date("2020-01-01"),
            netWorth: 10000000,
            netWorthFinancialYear: 2025,
            ...overrides,
        },
    };
}

const netWorthOptions = {
    bidSubmissionDate: "2026-06-01",
    requiredFinancialYear: 2025,
};

test("Net worth - PASS when positive and financial year matches", async () => {
    const result = await calculateMatching(
        makeNetWorthContractor(),
        netWorthTor,
        netWorthOptions
    );

    assert.equal(result.mandatoryResults[0].status, "pass");
});

test("Net worth - FAIL when net worth is negative", async () => {
    const result = await calculateMatching(
        makeNetWorthContractor({ netWorth: -500000 }),
        netWorthTor,
        netWorthOptions
    );

    assert.equal(result.mandatoryResults[0].status, "fail");
});

test("Net worth - UNKNOWN when net worth is missing", async () => {
    const result = await calculateMatching(
        makeNetWorthContractor({ netWorth: null }),
        netWorthTor,
        netWorthOptions
    );

    assert.equal(result.mandatoryResults[0].status, "unknown");
});

test("Net worth - UNKNOWN when financial year does not match", async () => {
    const result = await calculateMatching(
        makeNetWorthContractor({ netWorthFinancialYear: 2024 }),
        netWorthTor,
        netWorthOptions
    );

    assert.equal(result.mandatoryResults[0].status, "unknown");
});

test("Net worth - UNKNOWN when bid submission date is missing", async () => {
    const result = await calculateMatching(
        makeNetWorthContractor(),
        netWorthTor,
        { requiredFinancialYear: 2025 }
    );

    assert.equal(result.mandatoryResults[0].status, "unknown");
});

test("Net worth - UNKNOWN when company is less than one year old", async () => {
    const result = await calculateMatching(
        makeNetWorthContractor({
            companyRegistrationDate: new Date("2026-01-01"),
        }),
        netWorthTor,
        netWorthOptions
    );

    assert.equal(result.mandatoryResults[0].status, "unknown");
});

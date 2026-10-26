const {compareProjectType,} = require("./projectSimilarityService");
const { describeMatchingFailure } = require("./matchingFailure");
const ALLOWED_CATEGORIES = new Set(["mandatory", "scored"]);
const {findSemanticMatchesBatch,} = require("./semanticBatchMatcher");

function isPastProjectRequirement(requirement) {
    if (requirement.category !== "mandatory") {
        return false;
    }
  
    const field = requirement.profileField;
  
    if (["pastProjects", "maxPastProjectValue"].includes(field)) {
        return true;
    }
  
    // Some TOR analyzers classify project similarity as projectTypes.
    return (
        field === "projectTypes" && /past project|project contract|same type/i.test(
            String(requirement.text || "")
        )
    );
}

function getPastProjectCriteria(requirements) {
    const criteria = {
        minimumValue: null,
        minimumCount: 1,
        withinYears: null,
        requiresSameType: false,
        requiresContract: false,
        supported: true,
    };

    for (const requirement of requirements) {
        const text = String(requirement.text || "");
        const source = String(requirement.sourceText || "");
        const combined = `${text} ${source}`;

        const valueMatch = combined.match(
            /(?:not less than|at least|minimum|ไม่น้อยกว่า|อย่างน้อย)\s*([\d,]+(?:\.\d+)?)\s*(?:baht|THB|บาท)/i
        );

        if (valueMatch) {
            const value = Number(valueMatch[1].replace(/,/g, ""));
            criteria.minimumValue = Math.max(
                criteria.minimumValue ?? 0,
                value
            );
            criteria.requiresContract = true;
        }

        const yearsMatch = combined.match(
            /within\s+(?:the\s+)?last\s+(\d+)\s+years?/i
        );

        if (yearsMatch) {
            const years = Number(yearsMatch[1]);
            criteria.withinYears = Math.min(
                criteria.withinYears ?? years,
                years
            );
        }

        const contractCount = combined.match(
            /at\s+least\s+(\d+)\s+(?:past\s+)?project\s+contracts?/i
        );

        const projectCount = combined.match(
            /at\s+least\s+(\d+)\s+(?:past\s+)?projects?\b/i
        );

        if (contractCount) {
            criteria.minimumCount = Math.max(
                criteria.minimumCount,
                Number(contractCount[1])
            );
            criteria.requiresContract = true;
        } else if (projectCount) {
            criteria.minimumCount = Math.max(
                criteria.minimumCount,
                Number(projectCount[1])
            );
        }

        if (/same type|related to/i.test(text)) {
            criteria.requiresSameType = true;
        }

        // Avoid silently passing requirements we cannot interpret.
        if (
            !valueMatch &&
            !yearsMatch &&
            !contractCount &&
            !projectCount &&
            !/same type|related to/i.test(text)
        ) {
            criteria.supported = false;
        }
    }

    return criteria;
}
  
async function evaluatePastProjectsTogether(
    contractor,
    criteria,
    pastProjectRequirements
) {
    const projects = contractor.pastProjects || [];

    if (projects.length === 0) {
        return {
            status: "unknown",
            reason: "ยังไม่มีข้อมูลผลงานที่ผ่านมาในโปรไฟล์",
        };
    }

    if (!criteria.supported) {
        return {
            status: "unknown",
            reason: "ระบบยังไม่สามารถตรวจสอบเงื่อนไขบางส่วนเกี่ยวกับผลงานที่ผ่านมาได้",
        };
    }

    const now = new Date();
    const cutoff = new Date(now);

    if (criteria.withinYears !== null) {
        cutoff.setFullYear(now.getFullYear() - criteria.withinYears);
    }

    function checkProject(project) {
        let hasUnknown = false;

        if (criteria.requiresContract) {
            if (project.hasContract === false) {
                return "fail";
            }

            if (project.hasContract !== true) {
                hasUnknown = true;
            }
        }

        if (criteria.minimumValue !== null) {
            const rawValue = project.contractValue;

            if (
                rawValue === null ||
                rawValue === undefined ||
                rawValue === "" ||
                !Number.isFinite(Number(rawValue))
            ) {
                hasUnknown = true;
            } else if (Number(rawValue) < criteria.minimumValue) {
                return "fail";
            }
        }

        if (criteria.withinYears !== null) {
            if (!project.completedAt) {
                hasUnknown = true;
            } else {
                const completedAt = new Date(project.completedAt);

                if (Number.isNaN(completedAt.getTime())) {
                    hasUnknown = true;
                } else if (
                    completedAt < cutoff ||
                    completedAt > now
                ) {
                    return "fail";
                }
            }
        }

        return hasUnknown ? "unknown" : "pass";
    }

    const confirmed = projects.filter(
        (project) => checkProject(project) === "pass"
    );

    const possible = projects.filter(
        (project) => checkProject(project) !== "fail"
    );

    if (possible.length < criteria.minimumCount) {
        return {
            status: "fail",
            reason:
                `มีผลงานที่อาจเข้าเกณฑ์ได้มากที่สุด ${possible.length} โครงการ ` +
                `จากเงื่อนไขทั้งหมด แต่กำหนดอย่างน้อย ${criteria.minimumCount} โครงการ`,
        };
    }

    if (confirmed.length < criteria.minimumCount) {
        return {
            status: "unknown",
            reason:
                `ยืนยันผลงานได้ ${confirmed.length} โครงการ ` +
                `กำหนดอย่างน้อย ${criteria.minimumCount} โครงการ ` +
                "ข้อมูลผลงานบางส่วนยังไม่ครบ",
        };
    }

    if (criteria.requiresSameType) {
        const typeRequirement = pastProjectRequirements.find(
            (item) =>
                /same type|related to/i.test(String(item.text || ""))
        );

        if (!typeRequirement) {
            return {
                status: "unknown",
                reason: "ยังไม่พบข้อกำหนดประเภทผลงานที่ชัดเจน",
            };
        }

        try {
            const similarity = await compareProjectType(
                typeRequirement.text,
                confirmed
            );

            // Gemini currently identifies one matching project,
            // not the number of matching projects.
            if (criteria.minimumCount > 1) {
                return {
                    status: "unknown",
                    reason:
                        "ต้องตรวจสอบความเกี่ยวข้องของผลงานแต่ละโครงการ " +
                        "เพิ่มเติมก่อนยืนยันจำนวนผลงานที่ตรงตามเกณฑ์",
                };
            }

            return {
                status: similarity.status,
                reason:
                    `${similarity.reason} ` +
                    `(ผลงานที่ตรงกัน: ${similarity.matchedProject || "ยังไม่พบ"}; ` +
                    `ความมั่นใจ: ${similarity.confidence})`,
            };
        } catch (error) {
            console.error("Project similarity unavailable");

            return {
                status: "unknown",
                reason: "ขณะนี้ AI ยังไม่สามารถตรวจสอบประเภทผลงานได้",
            };
        }
    }

    return {
        status: "pass",
        reason:
            `มีผลงาน ${confirmed.length} โครงการที่ตรงตามเงื่อนไขทั้งหมด ` +
            "ทั้งสัญญา มูลค่า และวันที่เสร็จงาน",
    };
}

function evaluateLegalEligibility(requirement, contractor) {
    return require('./legalMatchingEvidence').evaluateLegalEvidence(requirement, contractor);
}

// Only evaluate requirements with a clearly recognized numeric threshold and a matching Contractor profile field.
function evaluateRequirement(requirement, contractor, options = {}) {
    const field = requirement.profileField;
    const text = String(requirement.text || "");
    const sourceText = String(requirement.sourceText || "");
    const combined = `${text} ${sourceText}`;

    // Total career years cannot establish years in a particular technology/domain.
    if (requirement.ownerRequirementIndex != null && field === 'experienceYears' &&
        /ด้าน|พัฒนา|\b(?:in|with|using)\b/i.test(combined)) {
        return { status: 'unknown', reason: 'ประสบการณ์รวมในโปรไฟล์ยังไม่ยืนยันจำนวนปีในด้านที่ TOR ระบุ ต้องมีหลักฐานประสบการณ์เฉพาะด้าน' };
    }

    // Evaluate team qualification requirements.
    if (field === "teamQualifications") {
        const team = contractor.teamQualifications || [];

        if (team.length === 0) {
            return {
                status: "unknown",
                reason: "ยังไม่มีข้อมูลคุณสมบัติทีมงานในโปรไฟล์",
            };
        }

        // Currently supports project coordinator requirements only.
        const isCoordinatorRequirement = /project coordinator|ผู้ประสานงานโครงการ/i.test(combined);

        if (!isCoordinatorRequirement) {
            return {
                status: "unknown",
                reason: "ระบบยังตรวจสอบบทบาททีมงานนี้ไม่ได้ ต้องตรวจหลักฐานเพิ่มเติม",
            };
        }

        const educationRanks = {
            unspecified: 0,
            vocational: 1,
            diploma: 2,
            bachelor: 3,
            master: 4,
            doctorate: 5,
        };

        const matchingMembers = team.filter((member) => {
            const isCoordinator = /project coordinator|coordinator|ผู้ประสานงาน/i.test( member.role || "" );

            const hasEnoughMembers = Number(member.memberCount) >= 1;

            const hasEnoughEducation = (educationRanks[member.educationLevel] || 0) >= educationRanks.bachelor;

            const hasEnoughExperience = Number(member.experienceYears) >= 2;

            return (
                isCoordinator &&
                hasEnoughMembers &&
                hasEnoughEducation &&
                hasEnoughExperience
            );
        });

        if (matchingMembers.length > 0) {
            return {
                status: "pass",
                reason:
                "พบผู้ประสานงานโครงการที่มีคุณสมบัติอย่างน้อย " +
                "ปริญญาตรีและประสบการณ์ 2 ปี",
            };
        }

        return {
            status: "unknown",
            reason:
                "ยังไม่พบข้อมูลผู้ประสานงานที่ครบตามเกณฑ์ในโปรไฟล์ " +
                "ข้อมูลทีมงานอาจยังไม่ครบถ้วน",
        };
    }

    
    if (field === "pastProjects" || field === "maxPastProjectValue") {
        const projects = contractor.pastProjects || [];
    
        if (projects.length === 0) {
            return {
                status: "unknown",
                reason: "ยังไม่มีข้อมูลผลงานที่ผ่านมาในโปรไฟล์",
            };
        }
    
        const requirementText = String(requirement.text || "");
        const lowerText = requirementText.toLowerCase();
    
        // 1. Check project age: within the last N years
        const yearsMatch = lowerText.match( /within\s+(?:the\s+)?last\s+(\d+)\s+years?/ );
    
        if (yearsMatch) {
            const years = Number(yearsMatch[1]);
            const cutoffDate = new Date();
            cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
        
            const matched = projects.some((project) => {
                const date = new Date(project.completedAt);
                return (
                    project.completedAt &&
                    !Number.isNaN(date.getTime()) &&
                    date >= cutoffDate &&
                    date <= new Date()
                );
            });
        
            return {
                status: matched ? "pass" : "unknown",
                reason: matched
                    ? `พบอย่างน้อยหนึ่งโครงการที่เสร็จภายใน ${years} ปี`
                    : `ยังไม่พบผลงานที่เสร็จภายใน ${years} ปี`,
            };
        }
    
        // 2. Check minimum number of past projects
        const countMatch = lowerText.match( /at\s+least\s+(\d+)\s+past\s+project/ );
    
        if (countMatch) {
            const required = Number(countMatch[1]);
            const actual = projects.length;
        
            return {
                status: actual >= required ? "pass" : "fail",
                reason: `ระบุผลงานไว้ ${actual} โครงการ เกณฑ์กำหนด ${required} โครงการ`,
            };
        }
    
        // 3. Check minimum contract value
        const valueMatch = requirementText.match( /(?:not\s+less\s+than|at\s+least|minimum)\s+([\d,]+)\s*(?:baht|THB)/i );
    
        if (valueMatch) {
            const required = Number(valueMatch[1].replace(/,/g, ""));
        
            const matched = projects.some(
                (project) => Number(project.projectValue) >= required
            );
        
            return {
                status: matched ? "pass" : "unknown",
                reason: matched
                    ? `พบอย่างน้อยหนึ่งโครงการที่มีมูลค่าไม่น้อยกว่า ${required} บาท`
                    : `ยังไม่พบผลงานที่มีมูลค่าไม่น้อยกว่า ${required} บาท`,
            };
        }
    
        // 4. Project type requires semantic comparison
        if ( lowerText.includes("same type") || lowerText.includes("related to") ) {
            return {
                status: "unknown",
                reason: "ต้องตรวจความเกี่ยวข้องของประเภทผลงานกับ TOR เพิ่มเติม",
            };
        }
        return {
            status: "unknown",
            reason: "ระบบยังตรวจเงื่อนไขผลงานข้อนี้ไม่ได้ ต้องตรวจหลักฐานเพิ่มเติม",
        };
    }
  

    
    if (field === "legalEligibility" || field?.startsWith("legalEligibility.") || requirement.requirementType === "legal") {
        return evaluateLegalEligibility(requirement, contractor);
    }

    // Evaluate conditional net worth requirements.
    if (field === "netWorth" || (field === "registeredCapital" && /net value|net worth|net assets|มูลค่าสุทธิ/i.test(combined))) {
        const legal = contractor.legalEligibility || {};
        const registrationDate = legal.companyRegistrationDate;
        const netWorth = legal.netWorth;
        const financialYear = legal.netWorthFinancialYear;

        // Date supplied from the original TOR.
        const bidSubmissionDate = options.bidSubmissionDate;

        if (!registrationDate || !bidSubmissionDate) {
            return {
                status: "unknown",
                reason: "ยังขาดวันที่จดทะเบียนบริษัทหรือวันที่ยื่นข้อเสนอที่ยืนยันแล้ว",
            };
        }

        const registeredAt = new Date(registrationDate);
        const submittedAt = new Date(bidSubmissionDate);

        if (
            Number.isNaN(registeredAt.getTime()) ||
            Number.isNaN(submittedAt.getTime())
        ) {
            return {
                status: "unknown",
                reason: "วันที่จดทะเบียนบริษัทหรือวันที่ยื่นข้อเสนอไม่ถูกต้อง",
            };
        }

        const oneYearAnniversary = new Date(registeredAt);
        oneYearAnniversary.setUTCFullYear(
            oneYearAnniversary.getUTCFullYear() + 1
        );

        if (submittedAt <= oneYearAnniversary) {
            return {
                status: "unknown",
                reason: "บริษัทจดทะเบียนยังไม่เกินหนึ่งปี ต้องตรวจเงื่อนไขคุณสมบัติกรณีนี้เพิ่มเติม",
            };
        }

        if (netWorth === null || netWorth === undefined) {
            return {
                status: "unknown",
                reason: "ยังไม่ได้ระบุมูลค่าสุทธิของกิจการในโปรไฟล์",
            };
        }

        if (!Number.isFinite(netWorth)) {
            return {
                status: "unknown",
                reason: "ข้อมูลมูลค่าสุทธิของกิจการไม่ถูกต้อง",
            };
        }

        if (!Number.isInteger(financialYear)) {
            return {
                status: "unknown",
                reason: "ยังไม่ได้ระบุปีงบการเงิน",
            };
        }

        // Must be explicitly established from the TOR,
        // not guessed from the current calendar year.
        const requiredFinancialYear = options.requiredFinancialYear;

        if (!Number.isInteger(requiredFinancialYear)) {
            return {
                status: "unknown",
                reason: "ยังไม่ยืนยันปีงบการเงินที่ TOR กำหนด",
            };
        }

        if (financialYear !== requiredFinancialYear) {
            return {
                status: "unknown",
                reason:
                    `ระบุงบการเงินปี ${financialYear} ` +
                    `แต่ TOR กำหนดปี ${requiredFinancialYear}`,
            };
        }

        if (netWorth > 0) {
            return {
                status: "pass",
                reason:
                    `ระบุมูลค่าสุทธิของกิจการเป็นบวก ${netWorth} บาท ` +
                    `สำหรับงบการเงินปี ${financialYear}`,
            };
        }

        return {
            status: "fail",
            reason:
                `ระบุมูลค่าสุทธิของกิจการ ${netWorth} บาท ` +
                `สำหรับงบการเงินปี ${financialYear} ซึ่งไม่เป็นบวกตามเกณฑ์`,
        };
    }

    const rules = {

        teamSize: {
            value: contractor.teamSize,
            units: "(?:people|persons|personnel|staff|members|คน|ราย)",
        },

        experienceYears: {
            value: contractor.experienceYears,
            units: "(?:years?|ปี)",
        },

        registeredCapital: {
            value: contractor.registeredCapital,
            units: "(?:baht|THB|บาท)",
        },
    };

    const rule = rules[field];

    if (!rule) {
        return {
            status: "unknown",
            reason: "ยังไม่มีหลักฐานเพียงพอสำหรับตรวจสอบเงื่อนไขข้อนี้ ต้องตรวจข้อมูลเพิ่มเติม",
        };
    }

    // Only recognize explicit minimum thresholds. Do not interpret vague wording as a numeric rule.
    const escapedUnits = rule.units;
    const minimumPattern = new RegExp(
        `(?:at least|minimum|not less than|ไม่น้อยกว่า|อย่างน้อย)` +
        `\\s*([\\d,]+(?:\\.\\d+)?)\\s*${escapedUnits}`,
        "i"
    );

    const match = combined.match(minimumPattern);

    if (!match) {
        return {
            status: "unknown",
            reason: "ยังไม่พบเกณฑ์ขั้นต่ำที่ชัดเจนในข้อกำหนด TOR",
        };
    }

    const minimum = Number(match[1].replace(/,/g, ""));
    const actual = rule.value;

    if (!Number.isFinite(minimum) || minimum < 0) {
        return {
            status: "unknown",
            reason: "เกณฑ์ขั้นต่ำของข้อกำหนดไม่ถูกต้อง",
        };
    }

    if (actual === null || actual === undefined ||
        !Number.isFinite(Number(actual))) {
        return {
            status: "unknown",
            reason: "ยังขาดข้อมูลโปรไฟล์ที่ใช้ตรวจสอบข้อนี้",
        };
    }

    // Default values such as 0 years or 1 team member may mean the user never filled in the field.
    // We must not automatically treat them as verified.
    if (
        (field === "experienceYears" && actual === 0) ||
        (field === "teamSize" && actual === 1)
    ) {
        return {
            status: "unknown",
            reason: "ค่าที่พบอาจเป็นค่าเริ่มต้นที่ผู้ใช้ยังไม่ได้ยืนยัน",
        };
    }

    const passed = Number(actual) >= minimum;

    return {
        status: passed ? "pass" : "fail",
        reason: `ข้อมูลในโปรไฟล์: ${actual} เกณฑ์ขั้นต่ำ: ${minimum}`,
    };
}

function evaluatePastProjectContract(requirement, contractor) {
    const text = String(requirement.text || "");
    const projects = contractor.pastProjects || [];

    if (projects.length === 0) {
        return {
            status: "unknown",
            reason: "ยังไม่มีข้อมูลผลงานที่ผ่านมาในโปรไฟล์",
        };
    }

    const countMatch = text.match(
        /at\s+least\s+(\d+)\s+past\s+project\s+contracts?/i
    );

    if (!countMatch) {
        return {
            status: "unknown",
            reason: "ต้องตรวจรายละเอียดเงื่อนไขสัญญาเพิ่มเติม",
        };
    }

    const requiredCount = Number(countMatch[1]);

    const confirmedContracts = projects.filter(
        (project) => project.hasContract === true
    );

    const unknownContracts = projects.filter(
        (project) => project.hasContract == null
    );

    if (confirmedContracts.length >= requiredCount) {
        return {
            status: "pass",
            reason:
                `มีผลงานที่ยืนยันสัญญาแล้ว ${confirmedContracts.length} โครงการ ` +
                `กำหนดอย่างน้อย ${requiredCount} โครงการ`,
        };
    }

    if (
        confirmedContracts.length + unknownContracts.length <
        requiredCount
    ) {
        return {
            status: "fail",
            reason:
                `พบสัญญายืนยันเพียง ${confirmedContracts.length} โครงการ ` +
                `กำหนดอย่างน้อย ${requiredCount} โครงการ`,
        };
    }

    return {
        status: "unknown",
        reason:
            "ผลงานบางโครงการยังไม่ได้ระบุว่ามีสัญญายืนยันหรือไม่",
    };
}


function normalizeSkillText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/\s+/g, " ")
        .trim();
}

function getRelevanceProfileEvidence(contractor, profileFields) {
    const evidence = [];
    const add = (field, values) => {
        if (!Array.isArray(values)) return;
        for (const value of values) {
            if (typeof value !== 'string') continue;
            const normalized = normalizeSkillText(value);
            if (normalized) evidence.push({ value: normalized, field });
        }
    };
    for (const field of new Set(Array.isArray(profileFields) ? profileFields : [])) {
        if (field === 'skills' || field === 'projectTypes') add(field, contractor[field]);
        if (field === 'pastProjects.projectType') add(field, (contractor.pastProjects || []).map(p => p.projectType));
        // A project title is context, never standalone evidence of hands-on technical skills.
        // Do not allow exact matching to bypass this restriction either.
        if (field === 'teamQualifications.skills') {
            for (const member of contractor.teamQualifications || []) add(field, member.skills);
        }
        if (field === 'experienceSummary' || field === 'profileSummary') add(field, [contractor[field]]);
    }
    return evidence;
}

async function evaluateProjectRelevanceBatch(
    criteria,
    contractor,
    options = {}
) {
    const states = criteria.map(criterion => {
        const skillGroups = Array.isArray(criterion.skillGroups)
            ? criterion.skillGroups
                .filter(Array.isArray)
                .map(group =>
                    group
                        .map(normalizeSkillText)
                        .filter(Boolean)
                )
                .filter(group => group.length > 0)
            : [];

        const profileEvidence = getRelevanceProfileEvidence(contractor, criterion.profileFields || []);
        const profileValues = profileEvidence.map(item => item.value);
        const evidenceFields = profileEvidence.map(item => item.field);

        const details = new Map();
        const unresolvedGroups = [];
        const unresolvedIndexes = [];

        // Exact matching
        if (profileValues.length > 0) {
            skillGroups.forEach((group, index) => {
                const evidence = profileValues.find(
                    value => group.includes(value)
                );

                if (evidence) {
                    details.set(index, {
                        groupIndex: index,
                        skillGroup: group,
                        evidence,
                        matchType: "exact",
                        reason: `พบทักษะ ${evidence} ตรงกับคุณสมบัติที่โครงการต้องการ`,
                    });
                } else {
                    unresolvedGroups.push(group);
                    unresolvedIndexes.push(index);
                }
            });
        }

        return {
            skillGroups,
            profileValues,
            evidenceFields,
            details,
            unresolvedGroups,
            unresolvedIndexes,
            semanticMatchingStatus: "not_needed",
        };
    });

    // Collect unresolved criteria into one AI batch
    const jobs = [];

    states.forEach((state, criterionIndex) => {
        if (
            state.unresolvedGroups.length > 0 &&
            state.profileValues.length > 0
        ) {
            jobs.push({
                criterionIndex,
                skillGroups: state.unresolvedGroups,
                profileValues: state.profileValues,
                evidenceFields: state.evidenceFields,
            });
        }
    });

    // One AI call for all unresolved criteria
    if (jobs.length > 0) {
        try {
            const matcher =
                options.semanticMatcher ||
                findSemanticMatchesBatch;

            const matches = await matcher(jobs);

            jobs.forEach(job => {
                states[job.criterionIndex]
                    .semanticMatchingStatus = "completed";
            });

            for (const match of matches) {
                const job = jobs[match.jobIndex];

                if (!job) continue;

                const state = states[job.criterionIndex];

                const originalIndex =
                    state.unresolvedIndexes[match.groupIndex];

                if (
                    originalIndex === undefined ||
                    !state.profileValues.includes(match.evidence) ||
                    typeof match.reason !== "string"
                ) {
                    continue;
                }

                state.details.set(originalIndex, {
                    groupIndex: originalIndex,
                    skillGroup: state.skillGroups[originalIndex],
                    evidence: match.evidence,
                    matchType: "semantic",
                    reason: match.reason,
                });
            }
        } catch (error) {
            const failure = describeMatchingFailure(error);
            console.warn(`[SEMANTIC] Batch request unavailable (${failure.code})`);
            options.onSemanticError?.(failure);

            jobs.forEach(job => {
                states[job.criterionIndex]
                    .semanticMatchingStatus = "unavailable";
            });
        }
    }

    // Build results with the original AND/OR rules
    return states.map(state => {
        const {
            skillGroups,
            profileValues,
            details,
            semanticMatchingStatus,
        } = state;

        if (skillGroups.length === 0) {
            return {
                status: "unknown",
                reason: "ไม่พบกลุ่มทักษะสำหรับการประเมิน",
                matchedGroups: [],
                missingGroups: [],
                matchDetails: [],
                semanticMatchingStatus,
            };
        }

        if (profileValues.length === 0) {
            return {
                status: "unknown",
                reason: "ไม่พบข้อมูลทักษะของผู้รับเหมาที่เกี่ยวข้องกับโครงการ",
                matchedGroups: [],
                missingGroups: skillGroups,
                matchDetails: [],
                semanticMatchingStatus,
            };
        }

        const matchedGroups = skillGroups.filter(
            (_, index) => details.has(index)
        );

        const missingGroups = skillGroups.filter(
            (_, index) => !details.has(index)
        );

        const matchDetails = [...details.values()]
            .sort((a, b) => a.groupIndex - b.groupIndex);

        const reasons = matchDetails.map(
            detail => detail.reason
        );

        if (missingGroups.length > 0) {
            reasons.push(
                "ยังไม่พบหลักฐานยืนยันว่าผู้รับเหมามีทักษะครบตามความต้องการของโครงการ"
            );
        }

        if (semanticMatchingStatus === "unavailable") {
            reasons.push(
                "ไม่สามารถใช้ AI วิเคราะห์ทักษะเพิ่มเติมได้ในขณะนี้"
            );
        }

        return {
            status: missingGroups.length === 0
                ? "pass"
                : "unknown",

            reason: reasons.join(" "),
            matchedGroups,
            missingGroups,
            matchDetails,
            semanticMatchingStatus,
        };
    });
}

// Keep the original single-criterion API working
async function evaluateProjectRelevance(
    criterion,
    contractor
) {
    const results = await evaluateProjectRelevanceBatch(
        [criterion],
        contractor
    );

    return results[0];
}

function getRelevanceFraction(result) {
    const totalGroupCount = result.skillGroups?.filter(group => Array.isArray(group) && group.length > 0).length ||
        (result.matchedGroups?.length || 0) + (result.missingGroups?.length || 0);
    const matchedGroupCount = Math.min(totalGroupCount, result.matchedGroups?.length || 0);
    return {
        totalGroupCount, matchedGroupCount,
        ratio: totalGroupCount > 0 ? matchedGroupCount / totalGroupCount : result.status === 'pass' ? 1 : 0,
    };
}
function relevanceWeights(results) {
    const documented = results.every(item => item.ownerRequirementIndex != null && Number.isFinite(item.documentedWeight) && item.documentedWeight >= 0);
    const sum = results.reduce((total, item) => total + (item.documentedWeight || 0), 0);
    return documented && sum > 0 ? results.map(item => item.documentedWeight / sum * 100) : results.map(() => 100 / results.length);
}
function rescoreMatchingResult(result) {
    if (!result.relevanceResults?.length) return result;
    const weights = relevanceWeights(result.relevanceResults);
    const relevanceResults = result.relevanceResults.map((criterion, index) => {
        const weight = weights[index];
        const { totalGroupCount, matchedGroupCount, ratio } = getRelevanceFraction(criterion);
        return {
            ...criterion, totalGroupCount, matchedGroupCount,
            coveragePercentage: totalGroupCount ? Math.round(ratio * 10000) / 100 : null,
            appliedWeight: Math.round(weight * 100) / 100,
            earnedWeight: Math.round(weight * ratio * 100) / 100,
        };
    });
    return { ...result, ...calculateRelevanceScore(relevanceResults), relevanceResults };
}

function calculateRelevanceScore(relevanceResults) {
    const total = relevanceResults.length;

    if (total === 0) {
        return {
            matchingPercentage: null,
            matchingPercentageUpperBound: null,
            scoringStatus: "not_available",
            weightingMethod: null,
            meetsDisplayThreshold: false,
        };
    }

    const fractions = relevanceResults.map(getRelevanceFraction);
    const weights = relevanceWeights(relevanceResults);
    const unknown = relevanceResults.filter(result => result.status === 'unknown').length;
    const lowerBound = Math.round(fractions.reduce((sum, item, index) => sum + item.ratio * weights[index], 0) * 100) / 100;
    const upperBound = Math.round(fractions.reduce((sum, item, index) =>
        sum + (relevanceResults[index].status === 'unknown' ? 1 : item.ratio) * weights[index], 0) * 100) / 100;

    return {
        matchingPercentage: lowerBound,
        matchingPercentageUpperBound: upperBound,
        scoringStatus:
            unknown > 0 ? "needs_profile_data" : "ready",
        weightingMethod: relevanceResults.every(item => item.ownerRequirementIndex != null) && relevanceResults.some(item => item.documentedWeight > 0) ? "documented" : "equal",
        meetsDisplayThreshold: lowerBound >= 45,
    };
}

function thaiMatchingReason(reason, status) {
    if (!reason || /[ก-๙]/.test(reason)) return reason;
    const numeric = String(reason).match(/^Profile value: (.*); required minimum: (.*)\.$/);
    if (numeric) return `ข้อมูลในโปรไฟล์: ${numeric[1]} เกณฑ์ขั้นต่ำ: ${numeric[2]}`;
    return status === 'pass' ? 'ข้อมูลที่ตรวจพบตรงกับเงื่อนไขที่ TOR กำหนด' : status === 'fail'
        ? 'ข้อมูลที่ตรวจพบไม่ตรงกับเงื่อนไขที่ TOR กำหนด' : 'ยังไม่มีหลักฐานเพียงพอสำหรับตรวจสอบเงื่อนไขข้อนี้ ต้องตรวจข้อมูลเพิ่มเติม';
}
function refreshMatchingExplanations(result, contractor, analysis) {
    if (!result) return result;
    const requirements = (analysis?.requirements || []).filter(row => row.category === 'mandatory');
    const mandatoryResults = (result.mandatoryResults || []).map((row, index) => {
        const criterion = requirements.find(item => item._id && String(item._id) === row.requirementId) || requirements.find(item => item.text === row.text) || requirements[index];
        const legal = criterion && (criterion.profileField === 'legalEligibility' || criterion.profileField?.startsWith('legalEligibility.') || criterion.requirementType === 'legal');
        const updated = legal ? { ...row, ...evaluateLegalEligibility(criterion, contractor) } : row;
        return { ...updated, reason: thaiMatchingReason(updated.reason, updated.status) };
    });
    const mandatorySummary = { total: mandatoryResults.length, passed: mandatoryResults.filter(row => row.status === 'pass').length,
        failed: mandatoryResults.filter(row => row.status === 'fail').length, unknown: mandatoryResults.filter(row => row.status === 'unknown').length };
    const eligibility = mandatorySummary.failed ? 'ineligible' : mandatorySummary.unknown ? 'unknown' : mandatorySummary.total ? 'eligible' : 'no_mandatory_requirements';
    const translate = rows => rows?.map(row => ({ ...row, reason: thaiMatchingReason(row.reason, row.status),
        ...(row.matchDetails ? { matchDetails: row.matchDetails.map(detail => ({ ...detail, reason: thaiMatchingReason(detail.reason, 'pass') })) } : {}) }));
    return { ...result, mandatoryResults, mandatorySummary, eligibility,
        scoredResults: translate(result.scoredResults), relevanceResults: translate(result.relevanceResults) };
}

async function calculateMatching(contractor, torAnalysis, options = {}) {
    if (!contractor || !torAnalysis) {
        throw new Error("Contractor and TOR analysis are required.");
    }

    if (!["completed", "needs_review"].includes(torAnalysis.status)) {
        throw new Error("TOR analysis is not ready for matching.");
    }

    const requirements = (torAnalysis.requirements || [])
        .filter((item) => ALLOWED_CATEGORIES.has(item.category));

    const pastProjectRequirements = requirements.filter(isPastProjectRequirement);
            
    const pastProjectCriteria = getPastProjectCriteria(pastProjectRequirements);
          
    const combinedPastProjectResult = pastProjectRequirements.length > 0
        ? await evaluatePastProjectsTogether(
            contractor,
            pastProjectCriteria,
            pastProjectRequirements
        )
        : null;

    const mandatoryResults = [];
    const scoredResults = [];
    const relevanceResults = [];

    
    const relevanceCriteria = torAnalysis.projectRelevance || [];

    const evaluations = await evaluateProjectRelevanceBatch(
        relevanceCriteria, contractor, options
    );
    relevanceCriteria.forEach((criterion, index) => {
        const evaluation = torAnalysis.torSource === 'internal' && criterion.ownerRequirementIndex != null &&
            !criterion.skillGroups?.length && criterion.profileField
            ? { ...evaluations[index], ...evaluateRequirement({ ...criterion, category: 'scored' }, contractor, options) }
            : evaluations[index];
        relevanceResults.push({
            criterionId: criterion._id?.toString() || null,
            ownerRequirementIndex: criterion.ownerRequirementIndex ?? null,
            documentedWeight: torAnalysis.torSource === "internal" ? criterion.weight ?? null : null,
            text: criterion.text,
            sourceText: criterion.sourceText || "",
            skillGroups: criterion.skillGroups || [],
            profileFields: criterion.profileFields || [],
            ...evaluation,
        });
    });


    for (const requirement of requirements) {
        const isPastProject = isPastProjectRequirement(requirement);
    
        let evaluation = isPastProject
            ? combinedPastProjectResult
            : evaluateRequirement(requirement, contractor, options);
    
        if (torAnalysis.torSource === 'internal' && requirement.ownerRequirementIndex != null && evaluation.status === 'unknown') {
            const criterion = relevanceResults.find(item => item.ownerRequirementIndex === requirement.ownerRequirementIndex);
            // Only complete technical evidence can satisfy a technical mandatory condition.
            if (criterion?.skillGroups?.length && ['technical', 'other'].includes(requirement.requirementType)) {
                evaluation = { status: criterion.status, reason: criterion.reason };
            }
        }
        const result = {
            requirementId: requirement._id?.toString() || null,
            text: requirement.text,
            category: requirement.category,
            profileField: requirement.profileField || null,
            sourceText: requirement.sourceText || "",
            status: evaluation.status,
            reason: evaluation.reason,
            ...(evaluation.conditionDetails ? { conditionDetails: evaluation.conditionDetails } : {}),
        };

        if (requirement.category === "mandatory") {
            mandatoryResults.push(result);
        } else if (requirement.category === "scored") {
            scoredResults.push({
                ...result,
                documentedWeight: requirement.weight ?? null,
            });
        }
    }

    const mandatorySummary = {
        total: mandatoryResults.length,
        passed: mandatoryResults.filter(r => r.status === "pass").length,
        failed: mandatoryResults.filter(r => r.status === "fail").length,
        unknown: mandatoryResults.filter(r => r.status === "unknown").length,
    };

    let eligibility = "unknown";

    if (mandatorySummary.failed > 0) {
        eligibility = "ineligible";
    } else if (
        mandatorySummary.total > 0 &&
        mandatorySummary.unknown === 0
    ) {
        eligibility = "eligible";
    } else if (mandatorySummary.total === 0) {
        eligibility = "no_mandatory_requirements";
    }

    const relevanceScore = calculateRelevanceScore(relevanceResults);
    
    // Scored criteria only. Mandatory never contributes to score.
    let matchingPercentage = null;
    let scoringStatus = "not_available";
    let weightingMethod = null;

    if (scoredResults.length > 0) {
        const weights = scoredResults.map(r => r.documentedWeight);

        const allMissing = weights.every(w => w === null);
        const allPresent = weights.every(
            w => typeof w === "number" &&
                Number.isFinite(w) && w >= 0
        );

        const sum = weights.reduce((total, w) => total + (w ?? 0), 0);

        if (allMissing) {
            weightingMethod = "equal";
            const equalWeight = 100 / scoredResults.length;

            for (const result of scoredResults) {
                result.appliedWeight = equalWeight;
            }

            scoringStatus = "ready";
        } else if (allPresent && Math.abs(sum - 100) < 0.01) {
            weightingMethod = "documented";

            for (const result of scoredResults) {
                result.appliedWeight = result.documentedWeight;
            }

            scoringStatus = "ready";
        } else {
            // Mixed or incomplete weights require review.
            scoringStatus = "needs_weights";
        }

        if (scoringStatus === "ready") {
            const allEvaluated = scoredResults.every(
                r => r.status === "pass" || r.status === "fail"
            );

            if (allEvaluated) {
                const score = scoredResults.reduce(
                    (total, r) =>
                        total + (r.status === "pass" ? r.appliedWeight : 0),
                    0
                );

                matchingPercentage = Math.round(score * 100) / 100;
            } else {
                scoringStatus = "needs_profile_data";
            }
        }
    }
    return rescoreMatchingResult({
        torId: torAnalysis.torId?.toString() || null,
        torSource: torAnalysis.torSource,
        eligibility,
        mandatorySummary,
        mandatoryResults,
        scoredResults,
        relevanceResults,
        matchingPercentage: relevanceResults.length > 0
            ? relevanceScore.matchingPercentage
            : matchingPercentage,

        matchingPercentageUpperBound: relevanceResults.length > 0
            ? relevanceScore.matchingPercentageUpperBound
            : matchingPercentage,

        scoringStatus: relevanceResults.length > 0
            ? relevanceScore.scoringStatus
            : scoringStatus,

        weightingMethod: relevanceResults.length > 0
            ? relevanceScore.weightingMethod
            : weightingMethod,

        meetsDisplayThreshold: relevanceResults.length > 0
            ? relevanceScore.meetsDisplayThreshold
            : matchingPercentage !== null && matchingPercentage >= 45,
    });
}

module.exports = {
    refreshMatchingExplanations,
    evaluateRequirement,
    evaluateProjectRelevance,
    evaluateProjectRelevanceBatch,
    calculateRelevanceScore,
    rescoreMatchingResult,
    calculateMatching,
};

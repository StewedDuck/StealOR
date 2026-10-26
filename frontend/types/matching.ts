import type { MarketTor } from "./tor";

export type ResultStatus = "pass" | "fail" | "unknown";

export type RequirementResult = {
    requirementId: string | null;
    text: string;
    sourceText?: string;
    category?: string;
    status: ResultStatus;
    reason?: string;
    conditionDetails?: {
        field: string | null;
        label: string;
        status: ResultStatus;
        actual: string;
        expected: string;
        reason: string;
    }[];
    documentedWeight?: number | null;
    appliedWeight?: number | null;
};

export type MatchDetail = {
    groupIndex: number;
    skillGroup: string[];
    evidence: string;
    matchType: "exact" | "semantic";
    reason: string;
};

export type RelevanceResult = {
    criterionId: string | null;
    text: string;
    sourceText?: string;
    skillGroups: string[][];
    profileFields: string[];
    status: ResultStatus;
    reason?: string;
    appliedWeight?: number;
    earnedWeight?: number;
    coveragePercentage?: number | null;
    matchedGroupCount?: number;
    totalGroupCount?: number;
    matchedGroups: string[][];
    missingGroups: string[][];

    // AI Semantic Matching
    matchDetails?: MatchDetail[];
    semanticMatchingStatus?:
        | "not_needed"
        | "completed"
        | "unavailable";
};

export type MatchingData = {
    tor?: MarketTor;
    analysisPipelineStatus?: 'waiting_data' | 'pending' | 'processing' | 'ready' | 'retry_wait' | 'failed' | 'not_available';
    torId: string;
    projectId?: string;
    torSource: "government" | "internal";

    matchingStatus?: "ready" | "stale" | "pending" | "unavailable";
    refreshState?: "ready" | "running" | "queued" | "retry_wait" | "failed" | "idle";
    failureCode?: string | null;
    retryAt?: string | null;
    analysisStatus?: string;
    relevanceStatus?: string;
    isProvisional?: boolean;

    projectName?: string;
    budget?: number | null;

    eligibility:
        | "eligible"
        | "ineligible"
        | "unknown"
        | "no_mandatory_requirements";

    mandatorySummary: {
        total: number;
        passed: number;
        failed: number;
        unknown: number;
    };

    matchingPercentage: number | null;
    matchingPercentageUpperBound?: number | null;
    scoringStatus: string;
    weightingMethod?: string;
    meetsDisplayThreshold: boolean;

    mandatoryResults: RequirementResult[];
    relevanceResults: RelevanceResult[];
};

export type MatchedTor = {
    tor: MarketTor;
    matching: MatchingData;
};


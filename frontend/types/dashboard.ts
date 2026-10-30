import type { MarketTor } from './tor';
export type MatchRatePoint = { month: string; key: string; rate: number | null; samples: number };
export type QualificationGap = { qualification: string; missed: number };
export type ContractorDashboard = {
    isCachedSnapshot?: boolean;
    summary: {
        matchedCount: number; newTodayCount: number; closingCount: number; matchedBudget: number;
        missingBudgetCount: number; assessedCount: number; totalCount: number; matchRate: number | null;
    };
    trend: MatchRatePoint[];
    qualificationGaps: QualificationGap[];
    softwareTypes: { name: string; value: number }[];
    closingTors: { tor: MarketTor; matchingPercentage: number; daysLeft: number }[];
    generatedAt: string;
    historyAvailable: boolean;
    pending: number; failed: number; waitingForData: number;
};

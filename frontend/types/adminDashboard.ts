export type TorMonth = { key: string; month: string; published: number; draft: number; pending: number };
export type UserDistribution = { name: string; value: number };
export type AdminDashboardCharts = { torMonths: TorMonth[]; userDistribution: UserDistribution[] };
export type AdminDashboardSummary = { users: number; tors: number; pendingVerifications: number; pendingTorReviews: number };

export type TorMonth = { key: string; month: string; published: number; draft: number; pending: number };
export type UserDistribution = { name: string; value: number };
export type AdminDashboardCharts = { torMonths: TorMonth[]; userDistribution: UserDistribution[] };
export type AdminDashboardSummary = { users: number; tors: number; pendingVerifications: number; pendingTorReviews: number };
export type AdminActivityType = 'tor_created' | 'tor_submitted' | 'tor_published' | 'tor_approved' | 'tor_changes_requested' | 'verification_submitted' | 'verification_approved' | 'verification_rejected';
export type AdminDashboardActivity = { events: { id: string; type: AdminActivityType; at: string; title: string; href: string }[] };

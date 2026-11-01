import type { ContractorDashboard } from '@/types/dashboard';
const KEY = 'tor-dashboard-snapshot';
const MAX_AGE = 60 * 60 * 1000;
let saved: { email: string; savedAt: number; data: ContractorDashboard } | undefined;
export function readDashboardSnapshot(email: string) {
    if (!saved && typeof window !== 'undefined') {
        try { saved = JSON.parse(window.sessionStorage.getItem(KEY) || 'null') || undefined; } catch { /* Storage is optional. */ }
    }
    return saved?.email === email && Date.now() - saved.savedAt < MAX_AGE && saved.data?.summary &&
        Array.isArray(saved.data.trend) ? { ...saved.data, isCachedSnapshot: true } : undefined;
}
export function writeDashboardSnapshot(email: string, data: ContractorDashboard) {
    saved = { email, savedAt: Date.now(), data };
    if (typeof window !== 'undefined') {
        try { window.sessionStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* Memory still covers navigation. */ }
    }
}

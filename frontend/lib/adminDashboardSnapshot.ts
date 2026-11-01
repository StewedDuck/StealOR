import type { AdminDashboardCharts, AdminDashboardSummary } from '@/types/adminDashboard';

type Sections = { summary: AdminDashboardSummary; charts: AdminDashboardCharts };
type Entry = { savedAt: number; data: unknown };
const MAX_AGE = 5 * 60 * 1000;
const memory = new Map<string, Entry>();
const keyFor = (email: string, section: keyof Sections) => `admin-dashboard-v1:${encodeURIComponent(email.trim().toLowerCase())}:${section}`;

export function readAdminSnapshot<K extends keyof Sections>(email: string, section: K): Sections[K] | null {
    const key = keyFor(email, section);
    let entry = memory.get(key);
    if (!entry && typeof window !== 'undefined') {
        try { entry = JSON.parse(window.sessionStorage.getItem(key) || 'null') || undefined; } catch { /* Storage is optional. */ }
    }
    if (!entry || !Number.isFinite(entry.savedAt) || Date.now() - entry.savedAt < 0 || Date.now() - entry.savedAt >= MAX_AGE) return null;
    const data = entry.data as Sections[K] | undefined;
    if (!data || typeof data !== 'object') return null;
    if (section === 'summary') {
        const summary = data as AdminDashboardSummary;
        if (![summary.users, summary.tors, summary.pendingVerifications, summary.pendingTorReviews].every(value => Number.isInteger(value) && value >= 0)) return null;
    } else {
        const charts = data as AdminDashboardCharts;
        if (!Array.isArray(charts.torMonths) || !Array.isArray(charts.userDistribution)) return null;
    }
    memory.set(key, entry);
    return data;
}
export function writeAdminSnapshot<K extends keyof Sections>(email: string, section: K, data: Sections[K]) {
    const key = keyFor(email, section);
    const entry = { savedAt: Date.now(), data };
    memory.set(key, entry);
    if (typeof window !== 'undefined') {
        try { window.sessionStorage.setItem(key, JSON.stringify(entry)); } catch { /* Memory still supports navigation. */ }
    }
}

import type { MatchingData } from '@/types/matching';

export type MatchingSnapshot = {
    data: MatchingData[];
    pending?: number;
    failed?: number;
};

// Share the last successful response across routes, scoped to the signed-in account.
// Session storage also covers a refresh while the database connection warms up.
// Every consumer still requests the latest server result in the background.
const STORAGE_KEY = 'tor-matching-snapshot';
const MAX_AGE_MS = 60 * 60 * 1000;
let snapshot: { email: string; value: MatchingSnapshot; savedAt: number } | undefined;
export function readMatchingSnapshot(email?: string | null) {
    if (!email) return;
    if (!snapshot && typeof window !== 'undefined') {
        try {
            const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null');
            if (stored && typeof stored.email === 'string' && Array.isArray(stored.value?.data) &&
                typeof stored.savedAt === 'number') snapshot = stored;
        } catch { /* Storage may be disabled or full. */ }
    }
    return snapshot?.email === email && Date.now() - snapshot.savedAt < MAX_AGE_MS ? snapshot.value : undefined;
}
export function writeMatchingSnapshot(email: string, value: MatchingSnapshot) {
    value = mergeMatchingSnapshot(readMatchingSnapshot(email), value);
    snapshot = { email, value, savedAt: Date.now() };
    if (typeof window !== 'undefined') {
        try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); }
        catch { /* In-memory navigation remains available. */ }
    }
    return value;
}

export function mergeMatchingSnapshot(previous: MatchingSnapshot | undefined, incoming: MatchingSnapshot): MatchingSnapshot {
    const oldRows = matchingByTor(previous?.data || []);
    return { ...incoming, data: incoming.data.map(row => {
        const old = oldRows[`${row.torSource}:${row.torId}`];
        // Compare actual computation times only for unchanged inputs. New TOR
        // criteria or profile evidence must still invalidate the previous result.
        if (row.analysisPipelineStatus === 'ready' && old?.matchingStatus === 'ready' &&
            row.inputFingerprint && old.inputFingerprint === row.inputFingerprint &&
            Date.parse(old.computedAt || '') > (Date.parse(row.computedAt || '') || 0)) {
            return { ...old, tor: row.tor || old.tor };
        }
        return row;
    }) };
}

export function matchingByTor(rows: MatchingData[]) {
    const matches: Record<string, MatchingData> = {};
    for (const match of rows) {
        matches[`${match.torSource}:${match.torId}`] = match;
        if (match.projectId) matches[`${match.torSource}:${match.projectId}`] = match;
    }
    return matches;
}

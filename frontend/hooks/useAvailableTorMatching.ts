"use client";
import { useEffect, useState } from 'react';
import type { MatchingData } from '@/types/matching';

// Read stored results only. Market/Saved never start new Gemini computations.
export function useAvailableTorMatching(email?: string | null) {
    const [matches, setMatches] = useState<Record<string, MatchingData>>({});
    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const controller = new AbortController();
        setMatches({});
        if (!email) return;
        const start = Date.now();
        async function load() {
            try {
                const response = await fetch('/api/matching?refresh=false', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
                if (!response.ok) return;
                const payload = await response.json();
                if (cancelled || !payload.success || !Array.isArray(payload.data)) return;
                const next: Record<string, MatchingData> = {};
                for (const match of payload.data as MatchingData[]) {
                    next[`${match.torSource}:${match.torId}`] = match;
                    if (match.projectId) next[`${match.torSource}:${match.projectId}`] = match;
                }
                setMatches(next);
                timer = setTimeout(() => void load(), payload.pending && Date.now() - start < 120000 ? 4000 : 30000);
            } catch { /* Keep ordinary TOR cards available when matching is unavailable. */ }
        }
        void load();
        return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
    }, [email]);
    return matches;
}

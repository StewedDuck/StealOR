"use client";
import { useEffect, useState } from 'react';
import type { MatchingData } from '@/types/matching';
import { matchingByTor, readMatchingSnapshot, writeMatchingSnapshot } from '@/lib/matchingSnapshot';

// Read stored results only. Market/Saved never start new Gemini computations.
export function useAvailableTorMatching(email?: string | null) {
    const [matches, setMatches] = useState<Record<string, MatchingData>>({});
    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const controller = new AbortController();
        const snapshot = readMatchingSnapshot(email);
        setMatches(matchingByTor(snapshot?.data || []));
        if (!email) return;
        let receivedFullResults = false;
        if (!snapshot) {
            void fetch('/api/matching?snapshot=true', { cache: 'no-store',
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
                .then(response => response.ok ? response.json() : null)
                .then(payload => {
                    if (!cancelled && !receivedFullResults && payload?.success && Array.isArray(payload.data)) {
                        setMatches(matchingByTor(payload.data));
                    }
                }).catch(() => {});
        }
        const start = Date.now();
        async function load() {
            let nextPollMs = 30000;
            try {
                const response = await fetch('/api/matching?refresh=false', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) });
                if (!response.ok) return;
                const payload = await response.json();
                if (cancelled || !payload.success || !Array.isArray(payload.data)) return;
                receivedFullResults = true;
                const resolved = writeMatchingSnapshot(email!, payload);
                setMatches(matchingByTor(resolved.data));
                nextPollMs = payload.pending && Date.now() - start < 120000 ? 4000 : 30000;
            } catch { /* Keep ordinary TOR cards available when matching is unavailable. */ }
            finally { if (!cancelled) timer = setTimeout(() => void load(), nextPollMs); }
        }
        void load();
        return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
    }, [email]);
    return matches;
}

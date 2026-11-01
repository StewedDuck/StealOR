"use client";
import { useEffect, useState } from 'react';
import { getLocalProjectDocuments } from '@/lib/torApi';
import { getGovernmentPublicationStatus, type PublicationStatus } from '@/lib/torPublicationStatus';

export function useGovernmentPublicationStatuses(tors: { source: string; projectId?: string }[]) {
    const ids = JSON.stringify([...new Set(tors.filter(t => t.source === 'government' && t.projectId).map(t => t.projectId!))].sort());
    const [statuses, setStatuses] = useState<Record<string, PublicationStatus>>({});
    useEffect(() => {
        let cancelled = false;
        const remaining: string[] = JSON.parse(ids);
        // Limit document requests independently of Gemini work.
        async function worker() {
            while (remaining.length && !cancelled) {
                const id = remaining.shift()!;
                let status: PublicationStatus = 'unknown';
                try {
                    status = getGovernmentPublicationStatus(await getLocalProjectDocuments(id, AbortSignal.timeout(15000)));
                } catch { /* Missing document metadata must never imply an open TOR. */ }
                if (!cancelled) setStatuses(previous => ({ ...previous, [id]: status }));
            }
        }
        void Promise.all(Array.from({ length: 4 }, worker));
        return () => { cancelled = true; };
    }, [ids]);
    return statuses;
}

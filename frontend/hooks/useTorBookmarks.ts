"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { getBookmarks, createBookmark, createInternalBookmark, deleteBookmark, deleteInternalBookmark } from '@/lib/torApi';
import { torBookmarkKey } from '@/lib/torIdentity';
import type { MarketTor } from '@/types/tor';
import type { MatchingData } from '@/types/matching';
import { useToast } from '@/components/toast/ToastProvider';

export function useTorBookmarks(email?: string | null) {
    const [savedIds, setSavedIds] = useState<string[]>([]);
    const [bookmarkLoading, setBookmarkLoading] = useState<string | null>(null);
    const busy = useRef(false);
    const mutationVersion = useRef(0);
    const { showToast } = useToast();
    useEffect(() => {
        let cancelled = false;
        setSavedIds([]);
        const reload = () => {
            if (!email || busy.current) return;
            const version = mutationVersion.current;
            void getBookmarks(email).then(bookmarks => {
                if (!cancelled && !busy.current && version === mutationVersion.current) setSavedIds(bookmarks.map(torBookmarkKey).filter(Boolean));
            }).catch(() => { if (!cancelled) showToast('โหลดสถานะการบันทึกไม่สำเร็จ', 'error'); });
        };
        reload();
        window.addEventListener('focus', reload);
        return () => { cancelled = true; window.removeEventListener('focus', reload); };
    }, [email, showToast]);
    const toggleBookmark = useCallback(async (tor: MarketTor, matching?: MatchingData) => {
        if (!email) { showToast('กรุณาเข้าสู่ระบบก่อนบันทึก TOR', 'error'); return; }
        const key = torBookmarkKey(tor);
        const id = tor.source === 'government' ? tor.projectId : tor.id;
        if (!id || !key || busy.current) return;
        const saved = savedIds.includes(key);
        busy.current = true;
        mutationVersion.current++;
        setBookmarkLoading(key);
        const options = matching ? {
            savedFrom: 'matching' as const,
            match: {
                ...(matching.matchingPercentage != null ? { percent: matching.matchingPercentage } : {}),
                matchedRequirements: matching.relevanceResults.filter(r => r.status === 'pass').map(r => r.text),
                unmatchedRequirements: matching.relevanceResults.filter(r => r.status === 'fail').map(r => r.text),
            },
        } : { savedFrom: 'market' as const };
        try {
            if (tor.source === 'government') {
                if (saved) await deleteBookmark(email, id);
                else await createBookmark(email, id, options);
            } else {
                if (saved) await deleteInternalBookmark(email, id);
                else await createInternalBookmark(email, id, options);
            }
            setSavedIds(previous => saved ? previous.filter(value => value !== key) : [...new Set([...previous, key])]);
            showToast(saved ? 'ยกเลิกการบันทึก TOR แล้ว' : 'บันทึก TOR แล้ว');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'บันทึก TOR ไม่สำเร็จ', 'error');
        } finally {
            busy.current = false;
            setBookmarkLoading(null);
        }
    }, [email, savedIds, showToast]);
    return { savedIds, bookmarkLoading, toggleBookmark };
}

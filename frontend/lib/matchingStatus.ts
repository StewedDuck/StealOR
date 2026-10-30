import type { MatchingData } from '@/types/matching';
import type { SavedTor } from '@/types/tor';

export function getMatchingProgress(rows: MatchingData[]) {
    return {
        completed: rows.filter(row => row.matchingStatus === 'ready').length,
        total: rows.length,
    };
}

export function getMatchingActivity(rows: MatchingData[]) {
    const counts = { processing: 0, queued: 0, retrying: 0, failed: 0, waitingForData: 0, withoutCriteria: 0 };
    for (const row of rows) {
        if (row.isCachedSnapshot) continue;
        const phase = row.analysisPipelineStatus;
        if (phase === 'waiting_data') counts.waitingForData++;
        else if (phase === 'not_available') counts.withoutCriteria++;
        else if (phase === 'failed' || row.matchingStatus === 'unavailable' || row.refreshState === 'failed') counts.failed++;
        else if (phase === 'retry_wait' || row.refreshState === 'retry_wait') counts.retrying++;
        else if (row.matchingStatus === 'ready') continue;
        else if (phase === 'processing' || row.refreshState === 'running') counts.processing++;
        else counts.queued++;
    }
    return counts;
}

// Bookmarks retain a score and evidence summary even when the TOR has closed
// and is no longer in the live matching catalog. Show it as a saved result.
export function savedMatchingSnapshot(tor: SavedTor): MatchingData | undefined {
    if (typeof tor.match?.percent !== 'number' || !Number.isFinite(tor.match.percent)) return;
    const criteria = (texts: string[], status: 'pass' | 'fail') => texts.map(text => ({
        criterionId: null, text, status, skillGroups: [], profileFields: [], matchedGroups: [], missingGroups: [],
    }));
    return {
        torId: tor.torId || tor.projectId || '', torSource: tor.source,
        matchingPercentage: tor.match.percent, matchingStatus: 'stale', refreshState: 'idle',
        eligibility: 'unknown', mandatorySummary: { total: 0, passed: 0, failed: 0, unknown: 0 },
        mandatoryResults: [], relevanceResults: [
            ...criteria(tor.match.matchedRequirements || [], 'pass'),
            ...criteria(tor.match.unmatchedRequirements || [], 'fail'),
        ], scoringStatus: 'saved_snapshot', meetsDisplayThreshold: tor.match.percent > 39,
    };
}

export function shouldShowMatchingCard(matching: MatchingData | null | undefined): matching is MatchingData {
    return !!matching && matching.analysisPipelineStatus !== 'waiting_data' &&
        typeof matching.matchingPercentage === 'number' &&
        Number.isFinite(matching.matchingPercentage) && matching.matchingPercentage > 39;
}

export function getMatchingRefreshLabel(matching: MatchingData) {
    if (matching.isCachedSnapshot) return 'ผลที่บันทึกไว้ — กำลังตรวจสอบข้อมูลล่าสุด';
    if (matching.scoringStatus === 'saved_snapshot') return 'ผล Matching ณ วันที่บันทึก';
    switch (matching.analysisPipelineStatus) {
        case 'waiting_data': return 'รอข้อมูล TOR';
        case 'pending': return 'รอวิเคราะห์เกณฑ์ TOR';
        case 'processing': return 'กำลังวิเคราะห์เกณฑ์ TOR';
        case 'retry_wait': return 'วิเคราะห์ TOR ไม่สำเร็จ — รอลองใหม่';
        case 'failed': return 'วิเคราะห์ TOR ไม่สำเร็จ — กรุณาลองใหม่';
        case 'not_available': return 'ยังไม่มีเกณฑ์ทักษะสำหรับคิดคะแนน';
    }
    switch (matching.refreshState) {
        case 'running': return 'กำลังประเมินผลใหม่';
        case 'queued': return 'รอคิวประเมิน';
        case 'retry_wait': return 'AI ไม่พร้อม — รอลองใหม่';
        case 'failed': return 'ประเมินไม่สำเร็จ — กรุณาลองใหม่';
        case 'ready': return null;
        default: return matching.matchingStatus === 'unavailable' ? 'ประเมินไม่สำเร็จ — กรุณาลองใหม่' :
            matching.matchingStatus === 'stale' ? 'ผลเดิม — รอประเมินใหม่' : null;
    }
}

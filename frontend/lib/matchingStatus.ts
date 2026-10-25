import type { MatchingData } from '@/types/matching';

export function shouldShowMatchingCard(matching: MatchingData | null | undefined): matching is MatchingData {
    return !!matching && matching.analysisPipelineStatus !== 'waiting_data' &&
        typeof matching.matchingPercentage === 'number' &&
        Number.isFinite(matching.matchingPercentage) && matching.matchingPercentage > 39;
}

export function getMatchingRefreshLabel(matching: MatchingData) {
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

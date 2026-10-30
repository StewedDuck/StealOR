import { LoaderCircle, RefreshCw } from 'lucide-react';
import type { getMatchingActivity } from '@/lib/matchingStatus';

type Props = {
    activity: ReturnType<typeof getMatchingActivity>;
    checking: boolean;
    sending: boolean;
    onRetry: () => void;
};

export default function MatchingEvaluationStatus({ activity, checking, sending, onRetry }: Props) {
    const working = checking || sending || activity.processing + activity.queued + activity.retrying > 0;
    if (!working && !activity.failed) return null;

    return (
        <section className="tm-evaluation-status" aria-label="สถานะการประเมิน TOR">
            {working && <div className="tm-working-heading" role="status">
                <LoaderCircle className="tm-status-spinner" size={18} aria-hidden="true" />
                <span>{sending ? 'กำลังส่งคำขอประเมินใหม่' : 'กำลังค้นหา TOR ที่ตรงกับคุณเพิ่มเติม'}</span>
            </div>}
            {activity.failed > 0 && <div className="tm-evaluation-notice">
                <span>บางรายการยังประเมินไม่ได้</span>
                <button className="tm-retry-button" type="button" disabled={sending}
                    aria-busy={sending} onClick={onRetry}>
                    <RefreshCw size={14} aria-hidden="true" /> ลองใหม่
                </button>
            </div>}
        </section>
    );
}

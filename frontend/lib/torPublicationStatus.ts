import { getDeadlineInfo, getTorDisplayDeadline } from "./torDeadline";
import type { LocalProjectDocuments } from "@/lib/torApi";

export type PublicationStatus = "open" | "draft" | "unknown";

export function getGovernmentPublicationStatus(
    documents: LocalProjectDocuments | null | undefined
): PublicationStatus {
    if (!documents) return "unknown";

    const invitation = documents.documents?.invitation;

    if (!invitation) return "unknown";

    return invitation.available && invitation.files.length > 0
        ? "open"
        : "draft";
}

export function getInternalPublicationStatus(
    status: string
): PublicationStatus {
    const normalized = status.toLowerCase();

    if (normalized === "draft" || normalized === "pending_verification") {
        return "draft";
    }

    if (normalized === "published" || normalized === "open" || normalized === "เปิดรับสมัคร") {
        return "open";
    }

    return "unknown";
}
export type TorProgressStatus = PublicationStatus | 'closed';
type TorPublicationInfo = { source: 'government' | 'internal'; status: string; deadline?: string | null; commentDeadlineAt?: string | null; biddingDeadline?: string | null; publicationStatus?: PublicationStatus };

export function isTorCommentClosed(tor: TorPublicationInfo, governmentStatus?: PublicationStatus, now = new Date()) {
    const deadline = Date.parse(tor.commentDeadlineAt || '');
    return tor.source === 'government' && (governmentStatus || tor.publicationStatus) === 'draft' &&
        Number.isFinite(deadline) && deadline <= now.getTime();
}

export function matchesTorStatusFilter(tor: TorPublicationInfo, filter: string, governmentStatus?: PublicationStatus) {
    if (filter === 'all') return true;
    if (filter === 'comments_closed') return isTorCommentClosed(tor, governmentStatus);
    return getTorProgressStatus(tor, governmentStatus) === (filter === 'published' ? 'open' : filter);
}

export function getTorProgressStatus(
    tor: TorPublicationInfo,
    governmentStatus?: PublicationStatus
): TorProgressStatus {
    const publicationStatus = tor.source === 'government' ? governmentStatus || tor.publicationStatus : getInternalPublicationStatus(tor.status);
    // Closing the comment period never publishes a draft or closes bidding.
    if (publicationStatus === 'draft') return 'draft';
    if (publicationStatus === 'open' && getDeadlineInfo(getTorDisplayDeadline(tor, publicationStatus)).status === 'closed') return 'closed';
    return tor.source === 'government'
        ? publicationStatus || 'unknown'
        : getInternalPublicationStatus(tor.status);
}

export function getTorProgressLabel(status: TorProgressStatus) {
    return { open: 'Open', draft: 'Draft', closed: 'ปิดรับสมัคร', unknown: 'Unknown' }[status];
}

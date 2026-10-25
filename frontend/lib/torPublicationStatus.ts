import { getDeadlineInfo } from "./torDeadline";
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

export function getTorProgressStatus(
    tor: { source: 'government' | 'internal'; status: string; deadline?: string | null },
    governmentStatus?: PublicationStatus
): TorProgressStatus {
    if (getDeadlineInfo(tor.deadline).status === 'closed') return 'closed';
    return tor.source === 'government'
        ? governmentStatus || 'unknown'
        : getInternalPublicationStatus(tor.status);
}

export function getTorProgressLabel(status: TorProgressStatus) {
    return { open: 'Open', draft: 'Draft', closed: 'ปิดรับแล้ว', unknown: 'Unknown' }[status];
}

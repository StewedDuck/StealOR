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

    if (normalized === "published" || normalized === "open") {
        return "open";
    }

    return "unknown";
}
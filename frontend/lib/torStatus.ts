export type TorDocumentStatus = "open" | "draft";

type InvitationDocument = {
    status?: string | null;
    downloadUrl?: string | null;
    url?: string | null;
} | null;

export function getTorDocumentStatus(
    invitation: InvitationDocument | undefined
): TorDocumentStatus {
    if (!invitation) return "draft";

    const hasDocument =
        Boolean(invitation.downloadUrl) ||
        Boolean(invitation.url);

    const isUnavailable = [
        "not_found",
        "failed",
        "error",
    ].includes(invitation.status?.toLowerCase() ?? "");

    return hasDocument && !isUnavailable
        ? "open"
        : "draft";
}
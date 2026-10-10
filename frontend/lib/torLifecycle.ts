import type { Tor } from "@/types/tor";

export type TorDisplayStatus =
    | "draft"
    | "unpublished"
    | "published"
    | "closed";

function isPastDeadline(value?: string | null): boolean {
    if (!value) return false;

    const deadline = new Date(value);

    if (Number.isNaN(deadline.getTime())) {
        return false;
    }

    // วันที่ผ่านไปแล้วถือว่าหมดเขต
    return deadline.getTime() <= Date.now();
}

export function getTorDisplayStatus(
    tor: Tor
): TorDisplayStatus {
    if (tor.status === "published") {
        return isPastDeadline(tor.applicationDeadline)
        ? "closed"
        : "published";
    }

    if (tor.status === "draft") {
        return isPastDeadline(tor.submissionDeadline)
        ? "unpublished"
        : "draft";
    }

    return "unpublished";
}

export function isVisibleInDraft(tor: Tor): boolean {
    return getTorDisplayStatus(tor) === "draft";
}

export function isVisibleInMyTor(tor: Tor): boolean {
    return getTorDisplayStatus(tor) !== "draft";
}
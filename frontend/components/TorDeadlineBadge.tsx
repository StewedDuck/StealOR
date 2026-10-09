"use client";

import { useEffect, useState } from "react";
import { getDeadlineInfo } from "@/lib/torDeadline";
import "./TorBadges.css";

type Props = {
    deadline?: string | null;
};

export default function TorDeadlineBadge({ deadline }: Props) {
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        setNow(new Date());

        const interval = window.setInterval(() => {
        setNow(new Date());
        }, 60_000);

        return () => window.clearInterval(interval);
    }, []);

    if (!now) return null;

    const info = getDeadlineInfo(deadline, now);

    if (!info.label) return null;

    return (
        <span
        className={`tor-deadline-badge ${
            info.status === "closed"
            ? "tor-deadline-closed"
            : "tor-deadline-open"
        }`}
        >
        {info.label}
        </span>
    );
}
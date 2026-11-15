"use client";

import { useEffect, useState } from "react";
import { getUserProfile, type UserProfile } from "@/lib/torApi";

const roleLabels: Record<UserProfile["accountRole"], string> = {
    contractor: "ผู้รับจ้าง",
    project_owner: "เจ้าของโครงการ",
    admin: "ผู้ดูแลระบบ",
};

export function useAccountRoleLabel(email?: string | null) {
    const [account, setAccount] = useState<{ email: string; role: UserProfile["accountRole"] } | null>(null);
    useEffect(() => {
        if (!email) return;
        let cancelled = false;
        getUserProfile(email).then(profile => {
            if (!cancelled) setAccount({ email, role: profile.accountRole });
        }).catch(error => console.warn("Failed to load sidebar account role:", error));
        return () => { cancelled = true; };
    }, [email]);
    return account && account.email === email ? roleLabels[account.role] : "—";
}

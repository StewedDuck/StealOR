'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getUserProfile, type UserProfile } from '@/lib/torApi';

// Headers and sidebars share the same database profile and save notifications.
export function useProfileIdentity() {
    const { data: session } = useSession();
    const email = session?.user?.email || '';
    const [loaded, setLoaded] = useState<{ email: string; profile: UserProfile } | null>(null);
    useEffect(() => {
        if (!email) return;
        let active = true;
        let revision = 0;
        const load = async () => {
            const current = ++revision;
            try {
                const profile = await getUserProfile(email);
                if (active && current === revision) setLoaded({ email, profile });
            } catch {
                // Keep the last successful identity during temporary API failures.
            }
        };
        const updated = () => { void load(); };
        window.addEventListener('stealor:profile-updated', updated);
        void load();
        return () => { active = false; window.removeEventListener('stealor:profile-updated', updated); };
    }, [email]);
    const profile = loaded?.email === email ? loaded.profile : null;
    const sessionName = session?.user?.name?.trim();
    const name = profile?.name?.trim() || (sessionName && sessionName !== '-' ? sessionName : email.split('@')[0]) || 'ผู้ใช้';
    const initials = name.split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase();
    return { name, initials, email };
}

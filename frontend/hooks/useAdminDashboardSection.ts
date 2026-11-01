'use client';

import { useEffect, useState } from 'react';
import { readAdminSnapshot, writeAdminSnapshot } from '@/lib/adminDashboardSnapshot';
import type { AdminDashboardCharts, AdminDashboardSummary } from '@/types/adminDashboard';

type Sections = { summary: AdminDashboardSummary; charts: AdminDashboardCharts };
export function useAdminDashboardSection<K extends keyof Sections>(email: string | undefined, section: K, reload: number) {
    const [state, setState] = useState<{ email?: string; data: Sections[K] | null; error: string; refreshing: boolean }>({ data: null, error: '', refreshing: false });
    useEffect(() => {
        if (!email) return;
        const accountEmail = email;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const cached = readAdminSnapshot(email, section);
        setState(previous => ({ email, data: previous.email === email ? previous.data ?? cached : cached, error: '', refreshing: true }));
        async function refresh() {
            setState(previous => ({ ...previous, refreshing: true }));
            try {
                const response = await fetch(`/api/admin/dashboard${section === 'charts' ? '?charts=true' : ''}`, {
                    cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
                });
                const result = await response.json();
                if (!response.ok || !result.success) throw new Error(result.error || 'โหลดข้อมูลแดชบอร์ดไม่สำเร็จ');
                if (!controller.signal.aborted) {
                    writeAdminSnapshot(accountEmail, section, result.data);
                    setState({ email, data: result.data, error: '', refreshing: false });
                }
            } catch (error) {
                if (!controller.signal.aborted) setState(previous => ({ ...previous, error: error instanceof Error ? error.message : 'โหลดข้อมูลแดชบอร์ดไม่สำเร็จ', refreshing: false }));
            } finally {
                if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 30000);
            }
        }
        void refresh();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [email, section, reload]);
    // Never display another account's data while the effect catches up with an account change.
    if (!email || state.email !== email) return { data: null, error: '', refreshing: false };
    return state;
}

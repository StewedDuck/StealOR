'use client';

import Link from 'next/link';
import { useProfileIdentity } from '@/hooks/useProfileIdentity';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { BellRing, LogOut, Settings, UserRound } from 'lucide-react';
import { ContractorNotification, getContractorNotifications } from '@/lib/torApi';

export default function HeaderActions() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const root = pathname.startsWith('/admin') ? '/admin' : pathname.startsWith('/project_own') ? '/project_own' : '/contractor';
    const [open, setOpen] = useState<'notifications' | 'profile' | null>(null);
    const [rows, setRows] = useState<ContractorNotification[]>([]);
    const [error, setError] = useState(false);
    const container = useRef<HTMLDivElement>(null);
    const { name, initials, email } = useProfileIdentity();
    useEffect(() => {
        setOpen(null);
    }, [pathname]);
    useEffect(() => {
        if (!session?.user?.email || open !== 'notifications') return;
        let active = true;
        setError(false);
        getContractorNotifications(session.user.email).then(data => { if (active) setRows(data); })
            .catch(() => { if (active) setError(true); });
        return () => { active = false; };
    }, [open, session?.user?.email]);
    useEffect(() => {
        const dismiss = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(null); };
        document.addEventListener('pointerdown', dismiss);
        return () => document.removeEventListener('pointerdown', dismiss);
    }, []);
    return <div className="app-header-actions" ref={container} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(null); }} onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(null); (container.current?.querySelector('[aria-expanded="true"]') as HTMLElement | null)?.focus(); }
    }}>
        <div className="app-header-popover" onMouseEnter={() => setOpen('notifications')} onMouseLeave={() => setOpen(null)}>
            <button type="button" className="app-header-bell" aria-label="การแจ้งเตือน" aria-expanded={open === 'notifications'} aria-controls="header-notifications" onClick={() => setOpen(open === 'notifications' ? null : 'notifications')}><BellRing size={20} /></button>
            {open === 'notifications' && <section id="header-notifications" className="app-header-panel" aria-label="การแจ้งเตือนล่าสุด">
                <strong>การแจ้งเตือนล่าสุด</strong>
                {error ? <p role="status">โหลดการแจ้งเตือนไม่สำเร็จ</p> : rows.length ? rows.slice(0, 4).map(row => <Link key={row._id} href={`${root}/notifications`} className="app-header-notice"><span>{!row.read && '• '}{row.title || 'การแจ้งเตือน'}</span><small>{row.message}</small></Link>) : <p>ยังไม่มีการแจ้งเตือน</p>}
                <Link href={`${root}/notifications`}>ดูการแจ้งเตือนทั้งหมด</Link>
            </section>}
        </div>
        <div className="app-header-popover" onMouseEnter={() => setOpen('profile')} onMouseLeave={() => setOpen(null)}>
            <button type="button" className="app-header-avatar" aria-label="เมนูโปรไฟล์" aria-expanded={open === 'profile'} aria-controls="header-profile" onClick={() => setOpen(open === 'profile' ? null : 'profile')}>{initials}</button>
            {open === 'profile' && <section id="header-profile" className="app-header-panel app-profile-panel" aria-label="โปรไฟล์">
                <strong>{name}</strong><p>{email}</p>
                <Link href="/contractor/account"><UserRound size={17} /> บัญชีของฉัน</Link>
                <Link href={`${root}/notifications?settings=true`}><Settings size={17} /> ตั้งค่าการแจ้งเตือน</Link>
                <button type="button" onClick={() => void signOut({ callbackUrl: '/login' })}><LogOut size={17} /> ออกจากระบบ</button>
            </section>}
        </div>
    </div>;
}

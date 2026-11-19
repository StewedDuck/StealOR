'use client';
import { useEffect, useState } from 'react';
import { Mail, Settings } from 'lucide-react';

export default function NotificationSettings() {
    const [expanded, setExpanded] = useState(false);
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        setExpanded(new URLSearchParams(window.location.search).get('settings') === 'true');
    }, []);
    useEffect(() => {
        let active = true;
        setError('');
        fetch('/api/notifications/preferences', { cache: 'no-store' }).then(async response => {
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'โหลดการตั้งค่าไม่สำเร็จ');
            if (active) setEnabled(result.data.emailNotificationsEnabled);
        }).catch(error => { if (active) setError(error.message); });
        return () => { active = false; };
    }, [attempt]);
    async function toggle() {
        if (enabled === null || saving) return;
        setSaving(true); setMessage(''); setError('');
        try {
            const response = await fetch('/api/notifications/preferences', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailNotificationsEnabled: !enabled }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'บันทึกการตั้งค่าไม่สำเร็จ');
            setEnabled(result.data.emailNotificationsEnabled);
            setMessage('บันทึกการตั้งค่าแล้ว');
        } catch (error) { setError(error instanceof Error ? error.message : 'บันทึกการตั้งค่าไม่สำเร็จ'); }
        finally { setSaving(false); }
    }
    return <section className="notification-settings">
        <button type="button" className="notification-settings-heading" aria-expanded={expanded} aria-controls="notification-settings-content" onClick={() => setExpanded(!expanded)}><Settings size={20} /> ตั้งค่าการแจ้งเตือน <span>{expanded ? '−' : '+'}</span></button>
        {expanded && <div id="notification-settings-content" className="notification-settings-content">
            <div className="notification-settings-row"><Mail size={22} /><div><strong>รับการแจ้งเตือนทางอีเมล</strong><p>แจ้งเตือน TOR ที่ตรงกัน กำหนดเวลา และอัปเดตบัญชีทางอีเมล<br />เมื่อปิด คุณยังดูการแจ้งเตือนทั้งหมดในระบบได้ตามปกติ</p></div>
                <button type="button" role="switch" aria-checked={enabled === true} aria-label="รับการแจ้งเตือนทางอีเมล" className={`notification-email-switch ${enabled ? 'enabled' : ''}`} disabled={enabled === null || saving} onClick={() => void toggle()}><span /></button>
                <span>{saving ? 'กำลังบันทึก…' : enabled === null ? 'กำลังโหลด…' : enabled ? 'เปิด' : 'ปิด'}</span>
            </div>
            {message && <p role="status">{message}</p>}
            {error && <p role="alert">{error} {enabled === null && <button type="button" onClick={() => setAttempt(attempt + 1)}>ลองใหม่</button>}</p>}
        </div>}
    </section>;
}

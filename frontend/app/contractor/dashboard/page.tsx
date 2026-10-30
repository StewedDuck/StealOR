"use client";

import { CircleCheckBig, Clock, ClockPlus, Coins, BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Sidebar from '@/components/sideBar';
import SummaryCard from '@/components/SummaryCard';
import MatchRateTrend from '@/components/MatchRateTrend';
import QualificationGapChart from '@/components/QualificationGapChart';
import TorDetailModal from '@/components/TORDetail';
import { getMarketTorById, getUserProfile } from '@/lib/torApi';
import { getTorProgressStatus, type PublicationStatus } from '@/lib/torPublicationStatus';
import type { ContractorDashboard } from '@/types/dashboard';
import type { MarketTorDetail, MarketTor } from '@/types/tor';
import { readDashboardSnapshot, writeDashboardSnapshot } from '@/lib/dashboardSnapshot';
import './dashboard.css';

function money(value: number) {
    return value >= 1000000 ? `฿${(value / 1000000).toLocaleString('th-TH', { maximumFractionDigits: 2 })}M` : `฿${value.toLocaleString('th-TH')}`;
}
export default function DashboardPage() {
    const { data: session, status } = useSession();
    const [data, setData] = useState<ContractorDashboard | null>(null);
    const [displayName, setDisplayName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const [selectedTor, setSelectedTor] = useState<MarketTorDetail | null>(null);
    const [publicationStatus, setPublicationStatus] = useState<PublicationStatus>('unknown');
    const [detailLoading, setDetailLoading] = useState<string | null>(null);
    useEffect(() => {
        const email = session?.user?.email;
        setDisplayName('');
        if (!email) return;
        let cancelled = false;
        getUserProfile(email).then(profile => { if (!cancelled) setDisplayName(profile.name); }).catch(() => {});
        return () => { cancelled = true; };
    }, [session?.user?.email]);
    useEffect(() => {
        if (status === 'loading') return;
        setData(null); setSelectedTor(null); setLoading(true); setError('');
        if (!session?.user?.email) { setLoading(false); setError('กรุณาเข้าสู่ระบบก่อนใช้งานแดชบอร์ด'); return; }
        const email = session.user.email;
        const cached = readDashboardSnapshot(email);
        if (cached) { setData(cached); setLoading(false); }
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const controller = new AbortController();
        let receivedFull = false;
        // Render persisted dashboard data while the full matching read warms up.
        void fetch('/api/contractor-dashboard?snapshot=true', {
            cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        }).then(async response => {
            const payload = await response.json();
            if (response.ok && payload.success && !cancelled && !receivedFull) {
                writeDashboardSnapshot(email, payload.data);
                setData(payload.data); setLoading(false);
            }
        }).catch(() => { /* The main request reports errors; a preview is optional. */ });
        async function load() {
            try {
                const response = await fetch('/api/contractor-dashboard', {
                    cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
                });
                const payload = await response.json();
                if (!response.ok || !payload.success) throw Error(payload.error || 'โหลดแดชบอร์ดไม่สำเร็จ');
                if (!cancelled) { receivedFull = true; writeDashboardSnapshot(email, payload.data); setData(payload.data); setError(''); }
            } catch (error) {
                if (!cancelled) setError(error instanceof Error ? error.message : 'โหลดแดชบอร์ดไม่สำเร็จ');
            } finally {
                if (!cancelled) { setLoading(false); timer = setTimeout(() => void load(), 30000); }
            }
        }
        void load();
        return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
    }, [session?.user?.email, status, reload]);

    async function viewTor(tor: MarketTor) {
        setDetailLoading(tor.id);
        try {
            const detail = await getMarketTorById(tor.projectId || tor.id);
            setPublicationStatus(tor.publicationStatus || 'unknown'); setSelectedTor(detail);
        } catch (error) { setError(error instanceof Error ? error.message : 'เปิดรายละเอียด TOR ไม่สำเร็จ'); }
        finally { setDetailLoading(null); }
    }
    const name = displayName || session?.user?.name || 'ผู้ใช้';
    const initials = name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
    const summary = data?.summary;
    const count = (value?: number) => value === undefined ? '—' : value.toLocaleString('th-TH');
    return <div className="dashboard-layout">
        <Sidebar />
        <main className="dashboard-main-header">
            <header className="dashboard-header">
                <div><h1>แดชบอร์ด</h1><p>ภาพรวมกิจกรรมของ TOR ที่ตรงกับคุณสมบัติของคุณ</p></div>
                <div className="dashboard-header-actions">
                    <Link href="/contractor/notifications" className="notification-buttom header-action-link header-notification-link" aria-label="การแจ้งเตือน"><BellRing size={16} /></Link>
                    <Link href="/contractor/account" className="user-avater header-action-link" aria-label="บัญชีของฉัน">{initials}</Link>
                </div>
            </header>
            <div className="dashboard-main"><div className="dashboard-content">
                {loading && <p className="dashboard-status" role="status">กำลังโหลดข้อมูลจริง… กำลังดึงผลที่บันทึกไว้</p>}
                {data?.isCachedSnapshot && !error && <p className="dashboard-status" role="status">แสดงผลที่บันทึกไว้ · กำลังตรวจสอบข้อมูลล่าสุด</p>}
                {error && <div className="dashboard-status" role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>ลองอีกครั้ง</button></div>}
                <section className="summary-grid">
                    <SummaryCard icon={<CircleCheckBig size={20} />} title="TORs ที่ตรงกัน" value={count(summary?.matchedCount)} footer="คะแนนมากกว่า 39% ตามหน้า Matching" footerType="success" />
                    <SummaryCard icon={<ClockPlus size={20} />} title="TORs มาใหม่วันนี้" value={count(summary?.newTodayCount)} footer="TOR เข้าระบบวันนี้ ตามเวลาไทย" />
                    <SummaryCard icon={<Clock size={20} />} title="TORs ใกล้ปิดรับ" value={count(summary?.closingCount)} footer="TOR ที่ตรงกันและเปิดรับ ปิดภายใน 5 วัน" footerType="warning" />
                    <SummaryCard icon={<Coins size={20} />} title="มูลค่า TORs ที่ตรงกัน" value={summary ? money(summary.matchedBudget) : '—'} footer={summary?.missingBudgetCount ? `ยังไม่ระบุงบประมาณ ${summary.missingBudgetCount} TOR` : 'งบประมาณรวมของ TOR ที่ตรงกัน'} />
                </section>
                <section className="dashboard-charts">
                    <MatchRateTrend data={data?.trend} currentRate={summary?.matchRate ?? null} />
                    <QualificationGapChart data={data?.qualificationGaps} />
                </section>
                {data && !data.historyAvailable && <p className="dashboard-status">ยังอ่านประวัติกราฟย้อนหลังไม่ได้ ข้อมูลสรุปปัจจุบันยังแสดงได้ตามปกติ</p>}
                <div className="dashboard-bottom-grid">
                    <div className="dashboard-card closing-card">
                        <div className="card-heading"><div><h2>ใกล้ปิดรับ</h2><p>TOR ที่ตรงกัน เปิดรับ และจะปิดภายใน 5 วัน</p></div><Link className="view-all" href="/contractor/matching">ดูทั้งหมด</Link></div>
                        <div className="closing-list">
                            {data && data.closingTors.length === 0 && <p className="dashboard-empty">ไม่มี TOR ที่ตรงกันและใกล้ปิดรับในช่วงนี้</p>}
                            {data?.closingTors.map(({ tor, matchingPercentage, daysLeft }) => <button key={`${tor.source}:${tor.id}`} type="button" className="closing-item" disabled={detailLoading !== null} onClick={() => void viewTor(tor)}>
                                <div className="closing-info"><div className="closing-title">{tor.projectName}</div><div className="closing-organization">{tor.agencyName || 'ไม่ระบุหน่วยงาน'}</div></div>
                                <div className="closing-meta"><span className="closing-match">{matchingPercentage}%</span><span className="closing-days">{detailLoading === tor.id ? 'กำลังเปิด…' : daysLeft === 0 ? 'ปิดรับวันนี้' : `อีก ${daysLeft} วัน`}</span></div>
                            </button>)}
                        </div>
                    </div>
                    <div className="dashboard-card software-card">
                        <div className="card-heading"><div><h2>แยกตามประเภทซอฟต์แวร์</h2><p>TOR เปิดรับ จัดกลุ่มจากข้อความและทักษะ (หนึ่ง TOR มีได้หลายประเภท)</p></div></div>
                        <div className="software-chart">
                            {data && data.softwareTypes.length === 0 && <p className="dashboard-empty">ยังไม่มี TOR เปิดรับสำหรับสรุปประเภท</p>}
                            {data?.softwareTypes.map(item => <SoftwareBar key={item.name} {...item} max={Math.max(1, ...data.softwareTypes.map(row => row.value))} />)}
                        </div>
                    </div>
                </div>
            </div></div>
        </main>
        {selectedTor && <TorDetailModal tor={selectedTor} progressStatus={getTorProgressStatus({ ...selectedTor, deadline: selectedTor.submissionDeadline }, publicationStatus)} onClose={() => setSelectedTor(null)} />}
    </div>;
}
function SoftwareBar({ name, value, max }: { name: string; value: number; max: number }) {
    return <div className="software-row"><span className="software-name">{name}</span><div className="software-track"><div className="software-fill" style={{ width: `${max > 0 ? value / max * 100 : 0}%` }} /></div><span className="software-value">{value}</span></div>;
}

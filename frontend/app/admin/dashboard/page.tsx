"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Sidebar from "@/components/sideBarAdmin";
import SummaryCard from "@/components/SummaryCard";
import {
    CircleCheckBig,
    Clock,
    BellRing,
    TriangleAlert,
} from "lucide-react";
import "./admin_dashboard.css";
import { useAdminDashboardSection } from "@/hooks/useAdminDashboardSection";
import type { AdminActivityType } from "@/types/adminDashboard";
import TorVolumeChart from "@/components/TorVolumeChart";
import UserDistributionChart from "@/components/UserDistributionChart";

const activityLabels: Record<AdminActivityType, string> = {
    tor_created: 'สร้าง TOR', tor_submitted: 'ส่ง TOR ตรวจ', tor_published: 'เผยแพร่ TOR',
    tor_approved: 'อนุมัติ TOR', tor_changes_requested: 'ขอแก้ไข TOR',
    verification_submitted: 'ส่งคำขอยืนยันตัวตน', verification_approved: 'อนุมัติการยืนยันตัวตน', verification_rejected: 'ปฏิเสธการยืนยันตัวตน',
};
const activityDate = (at: string) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(at));

export default function AdminDashboard() {
    const router = useRouter();
    const { user, ready } = useAuth();
    const [reload, setReload] = useState(0);
    const email = ready && user?.accountRole === 'admin' ? user.email.trim().toLowerCase() : undefined;
    const { data: summary, error, refreshing: summaryRefreshing } = useAdminDashboardSection(email, 'summary', reload);
    const { data: charts, error: chartError, refreshing: chartsRefreshing } = useAdminDashboardSection(email, 'charts', reload);
    const { data: activity, error: activityError, refreshing: activityRefreshing } = useAdminDashboardSection(email, 'activity', reload);
    useEffect(() => {
        if (!ready) return;
        if (!user) router.replace('/');
        else if (user.accountRole !== 'admin') router.replace('/contractor/dashboard');
    }, [ready, user, router]);
    if (!ready || !user || user.accountRole !== 'admin') return null;
    const count = (value?: number) => value === undefined ? '—' : value.toLocaleString('th-TH');

    return (
        <div className="admin-layout">

            {/* SIDEBAR */}
            <aside className="admin-sidebar">
                <Sidebar />
            </aside>


            {/* MAIN */}
            <main className="admin-main">

                {/* HEADER */}
                <header className="admin-header">
                    <div className="admin-header-content">
                        <h1>แดชบอร์ดผู้ดูแลระบบ</h1>
                        <p>
                            ภาพรวมระบบและรายการที่รอดำเนินการของผู้ดูแล
                        </p>
                    </div>
                </header>


                {/* CONTENT */}
                <div className="admin-content">

                    {(summary || charts) && (summaryRefreshing || chartsRefreshing || activityRefreshing) && <p role="status">กำลังอัปเดตข้อมูลล่าสุด…</p>}
                    {error ? <div role="alert">{error} {summary && 'แสดงข้อมูลที่โหลดไว้ก่อนหน้า'} <button onClick={() => setReload(value => value + 1)}>ลองอีกครั้ง</button></div> : !summary && <p role="status">กำลังโหลดข้อมูลสรุป…</p>}
                    <div className="admin-summary-grid">
                        <Link href="/admin/manageUser" style={{ color: 'inherit', textDecoration: 'none' }}><SummaryCard icon={<CircleCheckBig size={20} />} title="ผู้ใช้ทั้งหมด" value={count(summary?.users)} footer="บัญชีทั้งหมด รวมบัญชีที่ระงับ" /></Link>
                        <Link href="/admin/issue" style={{ color: 'inherit', textDecoration: 'none' }}><SummaryCard icon={<Clock size={20} />} title="TOR ของเจ้าของโครงการ" value={count(summary?.tors)} footer="ทุกสถานะ ไม่รวมข้อมูลนำเข้าจาก e-GP" /></Link>
                        <Link href="/admin/verification" style={{ color: 'inherit', textDecoration: 'none' }}><SummaryCard icon={<BellRing size={20} />} title="รอยืนยันตัวตน" value={count(summary?.pendingVerifications)} footer="คำขอที่รอผู้ดูแลตรวจสอบ" footerType="warning" /></Link>
                        <Link href="/admin/issue" style={{ color: 'inherit', textDecoration: 'none' }}><SummaryCard icon={<TriangleAlert size={20} />} title="TOR รออนุมัติ" value={count(summary?.pendingTorReviews)} footer="TOR ที่ส่งตรวจและยังรอผล" footerType="warning" /></Link>
                    </div>


                    {/* chart */}
                    {chartError && <div role="alert">{chartError} {charts && 'แสดงกราฟที่โหลดไว้ก่อนหน้า'} <button onClick={() => setReload(value => value + 1)}>ลองอีกครั้ง</button></div>}
                    {!charts ? !chartError && <p role="status">กำลังโหลดกราฟ…</p> : <div className="admin-chart-grid">
                        <TorVolumeChart data={charts.torMonths} />
                        <UserDistributionChart data={charts.userDistribution} />
                    </div>}

                    <div className="admin-dashboard-grid">
                        <div className="admin-card activity-card">
                            <div className="card-heading"><div><h2>กิจกรรมล่าสุด</h2><p>10 เหตุการณ์ล่าสุดจาก TOR และคำขอยืนยันตัวตน</p></div></div>

                            {activityError && <div role="alert">{activityError} {activity && 'แสดงข้อมูลที่โหลดไว้ก่อนหน้า'} <button onClick={() => setReload(value => value + 1)}>ลองอีกครั้ง</button></div>}
                            {!activity && !activityError && <p role="status">กำลังโหลดกิจกรรม…</p>}
                            {activity?.events.length === 0 && <p>ยังไม่มีกิจกรรม</p>}
                            <div className="activity-list">
                                {activity?.events.map(event => <div className="activity-item" key={event.id}>
                                    <time className="activity-time" dateTime={event.at}>{activityDate(event.at)}</time>
                                    <span className={`activity-badge ${event.type.startsWith('tor_') ? 'tor' : 'user'}`}>{event.type.startsWith('tor_') ? 'TOR' : 'USER'}</span>
                                    <Link className="activity-text" href={event.href}>{activityLabels[event.type]} — {event.title}</Link>
                                </div>)}
                            </div>
                        </div>
                        <div className="admin-card pending-card">
                            <div className="card-heading"><div><h2>รอดำเนินการ</h2><p>รายการที่ต้องได้รับการตรวจสอบจากแอดมิน</p></div></div>
                            <div className="pending-list">
                                <div className="pending-item"><div className="pending-info"><strong>การยืนยันตัวตน</strong><span>{count(summary?.pendingVerifications)} รายการรอตรวจสอบ</span></div><Link href="/admin/verification">ตรวจสอบ</Link></div>
                                <div className="pending-item"><div className="pending-info"><strong>TOR รออนุมัติ</strong><span>{count(summary?.pendingTorReviews)} รายการรอตรวจสอบ</span></div><Link href="/admin/issue">ตรวจสอบ TOR</Link></div>
                            </div>
                        </div>
                    </div>

                </div>

            </main>

        </div>
    );
}
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
import TorVolumeChart from "@/components/TorVolumeChart";
import UserDistributionChart from "@/components/UserDistributionChart";

export default function AdminDashboard() {
    const router = useRouter();
    const { user, ready } = useAuth();
    const [reload, setReload] = useState(0);
    const email = ready && user?.accountRole === 'admin' ? user.email.trim().toLowerCase() : undefined;
    const { data: summary, error, refreshing: summaryRefreshing } = useAdminDashboardSection(email, 'summary', reload);
    const { data: charts, error: chartError, refreshing: chartsRefreshing } = useAdminDashboardSection(email, 'charts', reload);
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

                    {(summary || charts) && (summaryRefreshing || chartsRefreshing) && <p role="status">กำลังอัปเดตข้อมูลล่าสุด…</p>}
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
                    <p role="note">กิจกรรมและรายการรอดำเนินการด้านล่างยังเป็นข้อมูลตัวอย่าง อยู่ระหว่างพัฒนา</p>


                    {/* ACTIVITY + PENDING */}
                    <div className="admin-dashboard-grid">

                        {/* RECENT ACTIVITY */}
                        <div className="admin-card activity-card">

                            <div className="card-heading">
                                <div>
                                    <h2>กิจกรรมล่าสุด</h2>
                                    <p>
                                        เหตุการณ์ล่าสุดในแพลตฟอร์ม
                                    </p>
                                </div>

                                <button className="view-all">
                                    ดูบันทึกทั้งหมด
                                </button>
                            </div>


                            <div className="activity-list">

                                {/* Activity 1 */}
                                <div className="activity-item">

                                    <span className="activity-time">
                                        วันนี้ 10:42
                                    </span>

                                    <span className="activity-badge user">
                                        USER
                                    </span>

                                    <span className="activity-text">
                                        ผู้รับเหมา Cooldog บันทึก TOR-2569-0142
                                    </span>

                                </div>


                                {/* Activity 2 */}
                                <div className="activity-item">

                                    <span className="activity-time">
                                        วันนี้ 09:18
                                    </span>

                                    <span className="activity-badge tor">
                                        TOR
                                    </span>

                                    <span className="activity-text">
                                        ร่าง TOR ใหม่ อัปโหลดโดย สำนักผังเมือง กทม.
                                    </span>

                                </div>


                                {/* Activity 3 */}
                                <div className="activity-item">

                                    <span className="activity-time">
                                        วันนี้ 08:55
                                    </span>

                                    <span className="activity-badge system">
                                        SYSTEM
                                    </span>

                                    <span className="activity-text">
                                        ข้อมูลจากหน่วยงาน BMA ซิงค์เรียบร้อยแล้ว — นำเข้า TOR ใหม่ 4 รายการ
                                    </span>

                                </div>


                                {/* Activity 4 */}
                                <div className="activity-item">

                                    <span className="activity-time">
                                        เมื่อวาน 17:30
                                    </span>

                                    <span className="activity-badge user">
                                        USER
                                    </span>

                                    <span className="activity-text">
                                        ส่งการยืนยันจากเจ้าของโครงการแล้ว
                                        — นอร์ธไลน์ ซอฟต์แวร์
                                    </span>

                                </div>


                                {/* Activity 5 */}
                                <div className="activity-item">

                                    <span className="activity-time">
                                        เมื่อวาน 14:05
                                    </span>

                                    <span className="activity-badge tor">
                                        TOR
                                    </span>

                                    <span className="activity-text">
                                        เอกสาร TOR ฉบับใหม่จาก MEA ได้รับการเผยแพร่แล้ว —
                                        การปรับปรุงโครงสร้างพื้นฐานคลาวด์ให้ทันสมัย
                                    </span>

                                </div>

                            </div>

                        </div>


                        {/* PENDING ACTIONS */}
                        <div className="admin-card pending-card">

                            <div className="card-heading">
                                <div>
                                    <h2>รอดำเนินการ</h2>
                                    <p>
                                        รายการที่ต้องได้รับการดูแลจากแอดมิน
                                    </p>
                                </div>
                            </div>


                            <div className="pending-list">

                                {/* Pending 1 */}
                                <div className="pending-item">

                                    <div className="pending-info">

                                        <strong>
                                            การยืนยันตัวตน
                                        </strong>

                                        <span>
                                            0 รายการรอตรวจสอบ
                                        </span>

                                    </div>

                                    <button>
                                        ตรวจสอบ
                                    </button>

                                </div>


                                {/* Pending 2 */}
                                <div className="pending-item">

                                    <div className="pending-info">

                                        <strong>
                                            รายงาน / ร้องเรียน
                                        </strong>

                                        <span>
                                            2 รายการที่ยังเปิดอยู่
                                        </span>

                                    </div>

                                    <button>
                                        ตรวจสอบ
                                    </button>

                                </div>


                                {/* Pending 3 */}
                                <div className="pending-item">

                                    <div className="pending-info">

                                        <strong>
                                            แหล่งข้อมูล TOR
                                        </strong>

                                        <span>
                                            1 แหล่งข้อมูลหยุดชั่วคราว —
                                            ตัวดึง Legacy e-GP
                                        </span>

                                    </div>

                                    <button>
                                        จัดการ
                                    </button>

                                </div>

                            </div>

                        </div>

                    </div>

                </div>

            </main>

        </div>
    );
}
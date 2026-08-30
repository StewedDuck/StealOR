"use client";

import { useEffect } from "react";
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
import TorVolumeChart from "@/components/TorVolumeChart";
import UserDistributionChart from "@/components/UserDistributionChart";

export default function AdminDashboard() {
    const router = useRouter();
    const { user } = useAuth();
    const torMonthlyData = [
        {
          month: "มี.ค.",
          published: 8,
          draft: 2,
        },
        {
          month: "เม.ย.",
          published: 10,
          draft: 3,
        },
        {
          month: "พ.ค.",
          published: 12,
          draft: 2,
        },
        {
          month: "มิ.ย.",
          published: 14,
          draft: 4,
        },
        {
          month: "ก.ค.",
          published: 15,
          draft: 3,
        },
        {
          month: "ส.ค.",
          published: 16,
          draft: 3,
        },
    ];

    const userDistributionData = [
        {
          name: "ผู้รับจ้าง",
          value: 186,
        },
        {
          name: "เจ้าของโครงการที่ยืนยันแล้ว",
          value: 41,
        },
        {
          name: "ผู้ดูแลระบบ",
          value: 3,
        },
    ];

    // Admin only
    useEffect(() => {
        if (!user) return;

        if (user.accountRole !== "admin") {
            router.replace("/dashboard");
        }
    }, [user, router]);

    // Don't show page while checking user
    if (!user || user.accountRole !== "admin") {
        return null;
    }

    return (
        <div className="admin-layout">

            {/* ================= SIDEBAR ================= */}
            <aside className="admin-sidebar">
                <Sidebar />
            </aside>


            {/* ================= MAIN ================= */}
            <main className="admin-main">

                {/* ================= HEADER ================= */}
                <header className="admin-header">
                    <div className="admin-header-content">
                        <h1>แดชบอร์ดผู้ดูแลระบบ</h1>
                        <p>
                            ภาพรวมระบบและรายการที่รอดำเนินการของผู้ดูแล
                        </p>
                    </div>
                </header>


                {/* ================= CONTENT ================= */}
                <div className="admin-content">

                    {/* ================= SUMMARY ================= */}
                    <div className="admin-summary-grid">

                        <SummaryCard
                            icon={<CircleCheckBig size={20} />}
                            title="ผู้ใช้ทั้งหมด"
                            value="248"
                            footer="+12 เดือนนี้"
                            footerType="success"
                        />

                        <SummaryCard
                            icon={<Clock size={20} />}
                            title="TOR ทั้งหมด"
                            value="12"
                            footer="3 ร่าง · 21 ประกาศแล้ว"
                            footerType="normal"
                        />

                        <SummaryCard
                            icon={<BellRing size={20} />}
                            title="รอยืนยันตัวตน"
                            value="0"
                            footer="ต้องได้รับการตรวจสอบโดยผู้ดูแล"
                            footerType="warning"
                        />

                        <SummaryCard
                            icon={<TriangleAlert size={20} />}
                            title="รายงานที่เปิดอยู่"
                            value="3"
                            footer="2 เรื่องร้องเรียนที่ยังไม่แก้ไข"
                            footerType="warning"
                        />

                    </div>

                    {/* chart */}
                    <div className="admin-chart-grid">
                        <TorVolumeChart />
                        <UserDistributionChart />
                    </div>


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
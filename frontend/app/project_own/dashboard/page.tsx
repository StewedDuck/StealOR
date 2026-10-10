"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
    BellRing,
    CheckCircle2,
    ChevronRight,
    Clock3,
    FileCheck2,
    FileText,
    ShieldCheck,
} from "lucide-react";

import Sidebar from "@/components/sideBar";
import { getDraftTors, getUserProfile, getMyTors } from "@/lib/torApi";
import { getTorDisplayStatus } from "@/lib/torLifecycle";
import type { Tor } from "@/types/tor";

import "./dashboard.css";
import Link from "next/link";

export default function ProjectOwnerDashboard() {
    const { data: session } = useSession();

    const [displayName, setDisplayName] = useState("");
    const [verificationStatus, setVerificationStatus] = useState< "not_required" | "pending" | "approved" | "rejected" >("not_required");

    const [tors, setTors] = useState<Tor[]>([]);
    const [loading, setLoading] = useState(true);

    const draftCount = tors.filter(
        (tor) => tor.status === "draft"
    ).length;

    const publishedCount = tors.filter(
        (tor) => getTorDisplayStatus(tor) === "published"
    ).length;

    const closedCount = tors.filter(
        (tor) => getTorDisplayStatus(tor) === "closed"
    ).length;

    const totalCount = tors.length;

    useEffect(() => {
        async function loadDashboard() {
        try {
            setLoading(true);

            const allTors = await getMyTors();
            setTors(allTors);
        } catch (error) {
            console.error("Failed to load project owner dashboard:", error);
        } finally {
            setLoading(false);
        }
        }

        loadDashboard();
    }, []);

    useEffect(() => {
        const email = session?.user?.email;
        if (!email) return;

          getUserProfile(email)
            .then((profile) => {
                setDisplayName(profile.name);
                setVerificationStatus(profile.verificationStatus);
            })
            .catch((error) => {
                console.error( "Failed to load project owner profile:", error );
            setDisplayName(session?.user?.name ?? "");
        });
    }, [session?.user?.email, session?.user?.name]);

    const userName =
        displayName ||
        session?.user?.name ||
        "ผู้ใช้";

    const initials = userName
        .split(" ")
        .map((word) => word[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

        const recentTors = useMemo(() => {
            return [...tors]
                .sort(
                    (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                )
                .slice(0, 5);
        }, [tors]);

    function formatDate(date?: string | null) {
        if (!date) return "-";

        const parsed = new Date(date);

        if (Number.isNaN(parsed.getTime())) {
        return "-";
        }

        return new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
        }).format(parsed);
    }

    return (
        <div className="owner-dashboard-layout">
            <Sidebar />

            <main className="owner-dashboard-main">
                {/* HEADER */}
                <header className="owner-dashboard-header">
                    <div>
                        <h1>แดชบอร์ด</h1>
                        <p>
                            ภาพรวมการจัดการ TOR ของคุณ
                            ติดตามสถานะและความคืบหน้าได้ที่นี่
                        </p>
                    </div>

                    <div className="owner-header-actions">
                        <button
                            className="owner-notification-button"
                            aria-label="Notifications"
                        >
                            <BellRing size={17} />
                        </button>

                        <div className="owner-avatar">
                            {initials}
                        </div>
                    </div>
                </header>

                <div className="owner-dashboard-content">
                    {/* SUMMARY CARDS */}
                    <section className="owner-summary-grid">
                        <SummaryCard
                            title="TOR ฉบับร่าง"
                            value={loading ? "-" : draftCount}
                            description="TOR ที่กำลังจัดทำ"
                            icon={<FileText size={21} />}
                        />

                        <SummaryCard
                            title="TOR ที่เผยแพร่"
                            value={loading ? "-" : publishedCount}
                            description="TOR ที่เผยแพร่แล้ว"
                            icon={<FileCheck2 size={21} />}
                        />

                        <SummaryCard
                            title="TOR ที่ปิดแล้ว"
                            value={loading ? "-" : closedCount}
                            description="TOR ที่สิ้นสุดการรับสมัคร"
                            icon={<CheckCircle2 size={21} />}
                        />

                        {/* VERIFICATION */}
                        <article className="verification-card">
                            <div className="verification-card-top">
                                <div className="summary-icon">
                                    <ShieldCheck size={21} />
                                </div>

                                <span>สถานะการยืนยันตัวตน</span>
                            </div>

                            <div className="verification-content">
                                <span className={`verification-badge ${verificationStatus}`}>
                                    {verificationStatus === "approved"
                                        ? "ยืนยันแล้ว"
                                        : verificationStatus === "pending"
                                        ? "รอตรวจสอบ"
                                        : verificationStatus === "rejected"
                                        ? "ไม่ผ่านการยืนยัน"
                                        : "ยังไม่ยืนยัน"
                                    }
                                </span>
                            </div>

                            <p>
                            {verificationStatus === "approved"
                                ? "บัญชีของคุณผ่านการยืนยันตัวตนแล้ว"
                                : verificationStatus === "pending"
                                ? "ข้อมูลของคุณกำลังรอการตรวจสอบ"
                                : verificationStatus === "rejected"
                                ? "การยืนยันตัวตนไม่ผ่าน กรุณาตรวจสอบข้อมูลอีกครั้ง"
                                : "กรุณายืนยันตัวตนก่อนเผยแพร่ TOR"
                            }
                            </p>
                        </article>
                    </section>

                    {/* MIDDLE */}
                    <section className="owner-middle-grid">
                        {/* ACTIVITY */}
                        <article className="owner-panel activity-panel">
                            <div className="panel-heading">
                                <div>
                                    <h2>ภาพรวม TOR ของคุณ</h2>
                                    <p>
                                        จำนวน TOR แยกตามสถานะปัจจุบัน
                                    </p>
                                </div>
                            </div>

                            <div className="tor-overview">
                                <div className="overview-total">
                                    <span className="overview-number">
                                        {loading ? "-" : totalCount}
                                    </span>

                                    <span>TOR ทั้งหมด</span>
                                </div>

                                <div className="overview-bars">
                                    <OverviewBar
                                        label="ฉบับร่าง"
                                        value={draftCount}
                                        total={Math.max(totalCount, 1)}
                                    />

                                    <OverviewBar
                                        label="เผยแพร่"
                                        value={publishedCount}
                                        total={Math.max(totalCount, 1)}
                                    />

                                    <OverviewBar
                                        label="ปิดแล้ว"
                                        value={closedCount}
                                        total={Math.max(totalCount, 1)}
                                    />
                                </div>
                            </div>
                        </article>

                        {/* VERIFICATION DETAIL */}
                        <article className="owner-panel verification-panel">
                            <div className="panel-heading">
                                <div>
                                    <h2>การยืนยันตัวตน</h2>
                                    <p>
                                        สถานะบัญชีเจ้าของโครงการ
                                    </p>
                                </div>
                            </div>

                            <div className="verification-big-icon">
                                <ShieldCheck size={35} />
                            </div>

                            <h3>
                                {verificationStatus === "approved"
                                    ? "ยืนยันตัวตนแล้ว"
                                    : verificationStatus === "pending"
                                    ? "กำลังรอตรวจสอบ"
                                    : verificationStatus === "rejected"
                                    ? "การยืนยันไม่ผ่าน"
                                    : "ยังไม่ได้ยืนยันตัวตน"
                                }
                            </h3>

                            <p className="verification-description">
                                {verificationStatus === "approved"
                                    ? "บัญชีของคุณผ่านการยืนยันตัวตนแล้ว"
                                    : verificationStatus === "pending"
                                    ? "เราได้รับข้อมูลของคุณแล้ว และกำลังรอการตรวจสอบ"
                                    : verificationStatus === "rejected"
                                    ? "กรุณาตรวจสอบข้อมูลและยืนยันตัวตนใหม่อีกครั้ง"
                                    : "ยืนยันตัวตนเพื่อให้สามารถเผยแพร่ TOR ได้"
                                }
                            </p>

                            {(verificationStatus === "not_required" ||
                                verificationStatus === "rejected") && (
                                <Link
                                    href="/project_own/verification"
                                    className="verify-button"
                                >
                                    {verificationStatus === "rejected"
                                    ? "ยืนยันใหม่"
                                    : "ยืนยันตัวตน"}
                                </Link>
                            )}
                        </article>
                    </section>

                    {/* RECENT TOR */}
                    <section className="owner-panel recent-panel">
                        <div className="panel-heading recent-heading">
                            <div>
                                <h2>TOR ล่าสุดของคุณ</h2>
                                <p>
                                รายการ TOR ที่คุณดำเนินการล่าสุด
                                </p>
                            </div>

                            <div className="recent-heading-actions">
                                <a
                                    href="/project_own/draft_TOR"
                                    className="view-all"
                                >
                                    ดูTORฉบับร่างทั้งหมด
                                    <ChevronRight size={15} />
                                </a>


                                <a
                                    href="/project_own/my_TOR"
                                    className="view-all"
                                >
                                    ดูTORทั้งหมด
                                    <ChevronRight size={15} />
                                </a>
                            </div>
                        </div>

                        <div className="recent-table">
                            <div className="recent-table-header">
                                <span>ชื่อ TOR</span>
                                <span>หน่วยงาน</span>
                                <span>สถานะ</span>
                                <span>อัปเดตล่าสุด</span>
                                <span />
                            </div>

                            {loading ? (
                                <div className="recent-empty">
                                    กำลังโหลด...
                                </div>
                            ) : recentTors.length === 0 ? (
                                <div className="recent-empty">
                                    ยังไม่มี TOR
                                </div>
                            ) : (
                                recentTors.map((tor) => (
                                <div
                                    className="recent-table-row"
                                    key={tor._id}
                                >
                                    <strong>
                                        {tor.projectName}
                                    </strong>

                                    <span>
                                        {tor.agencyName || "ไม่ระบุหน่วยงาน"}
                                    </span>

                                    <span>
                                        {(() => {
                                            const status = getTorDisplayStatus(tor);

                                            return (
                                                <span className={`status-badge ${status}`}>
                                                {status === "draft"
                                                    ? "ฉบับร่าง"
                                                    : status === "published"
                                                    ? "เผยแพร่แล้ว"
                                                    : status === "closed"
                                                    ? "ปิดรับแล้ว"
                                                    : "รอตรวจสอบ"}
                                                </span>
                                            );
                                        })()}
                                    </span>

                                    <span>
                                        {formatDate(tor.updatedAt)}
                                    </span>
                                </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}

function SummaryCard({
    title,
    value,
    description,
    icon,
}: {
    title: string;
    value: number | string;
    description: string;
    icon: React.ReactNode;
}) {
    return (
        <article className="summary-card">
            <div className="summary-card-top">
                <div className="summary-icon">
                {icon}
                </div>

                <span>{title}</span>
            </div>

            <strong className="summary-value">
                {value}
            </strong>

            <p>{description}</p>
        </article>
    );
}

function OverviewBar({
    label,
    value,
    total,
}: {
    label: string;
    value: number;
    total: number;
}) {
    const percentage = Math.min(
        (value / total) * 100, 100
    );

    return (
        <div className="overview-item">
            <div className="overview-item-heading">
                <span>{label}</span>
                <strong>{value}</strong>
            </div>

            <div className="overview-track">
                <div
                    className="overview-progress"
                    style={{
                        width: `${percentage}%`,
                    }}
                />
            </div>
        </div>
    );
}
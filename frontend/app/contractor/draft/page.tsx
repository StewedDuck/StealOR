"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/sideBar";
import { getDraftTors } from "@/lib/torApi";
import type { Tor } from "@/types/tor";
import {
    FileText,
    Search,
    TriangleAlert,
    X,
} from "lucide-react";
import "./draft.css";
import TorDetailModal from "@/components/TORDetail";

const dateFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" });

function formatBudget(budget: number | null) {
    return budget == null ? "ไม่ระบุ" : `฿${budget.toLocaleString("th-TH")}`;
}

function formatDate(value: string | null) {
    if (!value) return "ไม่ระบุ";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "ไม่ระบุ";
    return dateFormatter.format(date);
}

function formatReviewDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "ไม่ระบุวันที่";
    }

    return new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

export default function ContractorDraftTOR() {
    const [tors, setTors] = useState<Tor[]>([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTor, setActiveTor] = useState<Tor | null>(null);
    const [reviewTor, setReviewTor] = useState<Tor | null>(null);
    const [reviewText, setReviewText] = useState("");
    const [reviews, setReviews] = useState<
        { text: string; createdAt: string }[]
    >([]);

    useEffect(() => {
        getDraftTors()
            .then(setTors)
            .catch((err) => setError(err instanceof Error ? err.message : "โหลดรายการไม่สำเร็จ"))
            .finally(() => setLoading(false));
    }, []);

    const visibleTors = useMemo(() => {
        const keyword = query.trim().toLocaleLowerCase("th");
        if (!keyword) return tors;
        return tors.filter((tor) =>
            `${tor.projectName} ${tor.agencyName}`.toLocaleLowerCase("th").includes(keyword)
        );
    }, [query, tors]);

    return (
        <div className="draft_layout">
            <Sidebar />

            <main className="draft-main-header">
                <header className="draft-header">
                    <div className="draft-header-content">
                        <h1>TOR ฉบับร่าง</h1>
                        <p>อ่านและติดตาม TOR ที่เจ้าของโครงการกำลังจัดทำ ก่อนเปิดรับสมัครจริง</p>
                    </div>
                </header>

                <header className="draft-main">

                    <div className="draft-banner">
                        <TriangleAlert size={18} />
                        <span>
                            <b>TOR ร่างยังไม่เปิดรับสมัคร </b> 
                            รายการด้านล่างเป็นฉบับร่างที่เจ้าของโครงการยังจัดทำอยู่ กรุณาอ่านข้อกำหนดล่วงหน้า (เจ้าของโครงการอาจแก้ไขก่อนประกาศจริง)
                        </span>
                    </div>

                    <div className="draft-toolbar">
                        <Search size={17} />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="ค้นหาชื่อโครงการ"
                        />
                        <span>{visibleTors.length} รายการ</span>
                    </div>

                    {error && <div className="draft-error">
                        {error}
                    </div>}

                    {loading ? (
                        <div className="draft-state">
                            กำลังโหลดข้อมูล...
                        </div>
                    ) : visibleTors.length === 0 ? (
                        <div className="draft-state">
                            <FileText size={36} />
                            <h2>
                                {query 
                                    ? "ไม่พบ TOR ที่ค้นหา" 
                                    : "ยังไม่มี TOR ฉบับร่างในตอนนี้"
                                }
                            </h2>
                            <p>
                                {query 
                                    ? "ลองใช้คำค้นหาอื่น" 
                                    : "เมื่อเจ้าของโครงการสร้าง TOR ฉบับร่าง จะมาแสดงที่นี่"
                                }
                            </p>
                        </div>
                    ) : (
                        <div className="draft-list">
                            {visibleTors.map((tor) => (
                                <article className="draft-list-card" key={tor._id}>

                                    {/* ข้อมูล TOR */}
                                    <div className="draft-list-content">

                                        <div className="draft-list-top">
                                            <span className="draft-card-badge">
                                                ฉบับร่าง · ยังไม่เปิดรับสมัคร
                                            </span>

                                            <span className="draft-tor-id">
                                                TOR-{tor._id.slice(-8)}
                                            </span>
                                        </div>

                                        <p className="draft-list-agency">
                                            {tor.agencyName}
                                        </p>

                                        <h2 className="draft-list-title">
                                            {tor.projectName}
                                        </h2>

                                        {tor.description && (
                                            <p className="draft-list-desc">
                                                {tor.description}
                                            </p>
                                        )}

                                        <div className="draft-list-meta">

                                            <div className="draft-meta-item">
                                                <span>งบประมาณ</span>
                                                <strong>
                                                    {formatBudget(tor.budget)}
                                                </strong>
                                            </div>

                                            <div className="draft-meta-item">
                                                <span>กำหนดส่ง</span>
                                                <strong>
                                                    {formatDate(tor.submissionDeadline)}
                                                </strong>
                                            </div>

                                            <div className="draft-meta-item">
                                                <span>คุณสมบัติ</span>
                                                <strong>
                                                    {tor.requirements.length} ข้อ
                                                </strong>
                                            </div>

                                        </div>

                                    </div>

                                    {/* ปุ่ม */}
                                    <div className="draft-list-actions">

                                        <button
                                            type="button"
                                            onClick={() => setActiveTor(tor)}
                                        >
                                            ดูรายละเอียด
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setReviewTor(tor)}
                                        >
                                            รีวิว
                                        </button>

                                    </div>

                                </article>
                            ))}
                        </div>
                    )}
                </header>
            </main>

            {activeTor && (
                <TorDetailModal
                    tor={activeTor}
                    onClose={() => setActiveTor(null)}
                />
            )}

            {reviewTor && (
                <div
                    className="draft-modal-overlay"
                    onClick={() => setReviewTor(null)}
                >
                    <div
                        className="review-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="draft-modal-close"
                            onClick={() => setReviewTor(null)}
                        >
                            <X size={20} />
                        </button>

                        <h2>เขียนความคิดเห็น</h2>

                        <p className="review-modal-sub">
                            {reviewTor.projectName}
                        </p>

                        <div className="review-list">
                            <h3>ความคิดเห็น</h3>

                            {reviews.length === 0 ? (
                                <p className="no-review">
                                    ยังไม่มีความคิดเห็น
                                </p>
                            ) : (
                                reviews.map((review, index) => (
                                    <div className="review-item" key={index}>
                                        <div className="review-item-header">
                                            <strong>คุณ</strong>

                                            <span>
                                                {formatReviewDate(review.createdAt)}
                                            </span>
                                        </div>

                                        <p>{review.text}</p>
                                    </div>
                                ))
                            )}
                        </div>

                        <textarea
                            value={reviewText}
                            onChange={(e) => setReviewText(e.target.value)}
                            placeholder="เขียนความคิดเห็นของคุณ..."
                            rows={5}
                        />

                        <div className="review-modal-actions">
                            <button
                                className="review-cancel"
                                onClick={() => {
                                    setReviewText("");
                                    setReviewTor(null);
                                }}
                            >
                                ยกเลิก
                            </button>

                            <button
                                className="review-submit"
                                onClick={() => {
                                    if (!reviewText.trim()) return;

                                    setReviews((prev) => [
                                        ...prev,
                                        {
                                            text: reviewText.trim(),
                                            createdAt: new Date().toISOString(),
                                        },
                                    ]);
                                    
                                    setReviewText("");
                                }}
                            >
                                ส่งความคิดเห็น
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
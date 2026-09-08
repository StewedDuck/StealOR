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

export default function ContractorDraftTOR() {
    const [tors, setTors] = useState<Tor[]>([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTor, setActiveTor] = useState<Tor | null>(null);

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
                    <p>ผู้รับจ้าง</p>
                    <h1>TOR ฉบับร่าง</h1>
                    <span>อ่านและติดตาม TOR ที่เจ้าของโครงการกำลังจัดทำ ก่อนเปิดรับสมัครจริง</span>
                </header>

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
                    <div className="draft-grid">
                        {visibleTors.map((tor) => (
                            <article className="draft-card" key={tor._id}>
                                <span className="draft-card-badge">
                                    ฉบับร่าง; ยังไม่เปิดรับสมัคร
                                </span>

                                <h2>
                                    {tor.projectName}
                                </h2>

                                <p className="draft-card-agency">
                                    {tor.agencyName}
                                </p>

                                {tor.description && <p className="draft-card-desc">
                                    {tor.description}
                                </p>}

                                <div className="draft-card-meta">
                                    <span>
                                        งบประมาณ
                                        <b>{formatBudget(tor.budget)}</b>
                                    </span>

                                    <span>
                                        กำหนดส่ง
                                        <b>{formatDate(tor.submissionDeadline)}</b>
                                    </span>

                                    <span>
                                        คุณสมบัติ
                                        <b>{tor.requirements.length} ข้อ</b>
                                    </span>

                                </div>
                                <div className="draft-card-footer">
                                    <button onClick={() => setActiveTor(tor)}>
                                        ดูรายละเอียด
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </main>

            {activeTor && (
                <div className="draft-modal-overlay" onClick={() => setActiveTor(null)}>
                    <div className="draft-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="draft-modal-close" onClick={() => setActiveTor(null)}>
                            <X size={20} />
                        </button>

                        <h2>
                            {activeTor.projectName}
                        </h2>

                        <p className="draft-modal-sub">
                            {activeTor.agencyName} · ฉบับร่าง
                        </p>

                        <div className="draft-modal-grid">
                            <div className="draft-modal-info">
                                <span>งบประมาณ</span>
                                <strong>{formatBudget(activeTor.budget)}</strong>
                            </div>

                            <div className="draft-modal-info">
                                <span>กำหนดส่ง</span>
                                <strong>{formatDate(activeTor.submissionDeadline)}</strong>
                            </div>

                            <div className="draft-modal-info">
                                <span>ผู้ติดต่อ</span>
                                <strong>{activeTor.contactName || "ไม่ระบุ"}</strong>
                            </div>
                        </div>

                        {activeTor.description && (
                            <section className="draft-modal-section">
                                <h3>รายละเอียดโครงการ</h3>
                                <p>{activeTor.description}</p>
                            </section>
                        )}

                        {activeTor.objectives.length > 0 && (
                            <section className="draft-modal-section">
                                <h3>วัตถุประสงค์</h3>
                                <ul>
                                    {activeTor.objectives.map((item, i) => (
                                        <li key={i}>{item}</li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {activeTor.scopeOfWork.length > 0 && (
                            <section className="draft-modal-section">
                                <h3>ขอบเขตงาน</h3>
                                <ul>
                                    {activeTor.scopeOfWork.map((item, i) => (
                                        <li key={i}>{item}</li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {activeTor.requirements.length > 0 && (
                            <section className="draft-modal-section">
                                <h3>คุณสมบัติที่ต้องการ</h3>
                                {activeTor.requirements.map((req, i) => (
                                    <div className="draft-req-item" key={i}>
                                        <span>{req.description}</span>
                                        <span className={`draft-req-tag ${req.mandatory ? "mandatory" : ""}`}>
                                            {req.mandatory 
                                                ? "บังคับ" 
                                                : `น้ำหนัก ${req.weight}%`
                                            }
                                        </span>
                                    </div>
                                ))}
                            </section>
                        )}

                        {activeTor.contactEmail && (
                            <section className="draft-modal-section">
                                <h3>ติดต่อ</h3>
                                <p>
                                    {activeTor.contactName 
                                        ? `${activeTor.contactName} · ` 
                                        : ""}{activeTor.contactEmail
                                    }
                                </p>

                            </section>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
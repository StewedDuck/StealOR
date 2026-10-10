"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/sideBar";
import { useToast } from "@/components/toast/ToastProvider";
import {
    Search,
    CalendarDays,
    Eye,
    Send,
    Trash2,
    X,
    Clock3,
    RotateCcw,
    FileText,
    ChevronDown,
} from "lucide-react";

import {
    getMyTors,
    getTorById,
    publishTor,
    deleteTor,
} from "@/lib/torApi";

import type { Tor } from "@/types/tor";
import "./my_TOR.css";
import {
    getTorDisplayStatus,
    isVisibleInMyTor,
} from "@/lib/torLifecycle";
type FilterStatus = "all" | "draft" | "published" | "closed";
type DisplayStatus = "draft" | "published" | "closed";

function getStatus(tor: Tor): DisplayStatus {
    const status = getTorDisplayStatus(tor);

    if (status === "unpublished" || status === "draft") {
        return "draft";
    }

    return status;
}

function formatDate(value?: string | null) {
    if (!value) return "ยังไม่ระบุ";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "ยังไม่ระบุ";

    return new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Bangkok",
    }).format(date);
}

function formatDateTime(value?: string | null) {
    if (!value) return "ยังไม่ระบุ";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "ยังไม่ระบุ";

    return new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
    }).format(date);
}

function getDaysLeft(value?: string | null) {
  if (!value) return null;

  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return null;

  const bangkokDate = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value);

    return Date.UTC(get("year"), get("month") - 1, get("day"));
  };

  return Math.round(
    (bangkokDate(deadline) - bangkokDate(new Date())) / 86400000
  );
}

function formatBudget(value: number | null) {
    if (value == null) return "ไม่ระบุ";
    return `${value.toLocaleString("th-TH")} บาท`;
}

function statusLabel(status: DisplayStatus) {
    if (status === "published") return "เผยแพร่แล้ว";
    if (status === "closed") return "ปิดรับแล้ว";
    return "ยังไม่เผยแพร่";
}

function getTodayInBangkok() {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());

    const value = (type: string) =>
        parts.find((part) => part.type === type)?.value ?? "";

    return `${value("year")}-${value("month")}-${value("day")}`;
}

export default function MyTORPage() {
    const { showToast } = useToast();

    const [tors, setTors] = useState<Tor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] =  useState<FilterStatus>("all");

    const [selectedTor, setSelectedTor] = useState<Tor | null>(
        null
    );
    const [publishTarget, setPublishTarget] = useState<Tor | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Tor | null>(null);

    const [applicationDeadline, setApplicationDeadline] = useState("");

    const [busy, setBusy] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);

    useEffect(() => {
        async function loadTors() {
        try {
            setLoading(true);
            setError("");

            const data = await getMyTors();
            setTors(data);
        } catch (err) {
            setError(
            err instanceof Error
                ? err.message
                : "ไม่สามารถโหลด TOR ได้"
            );
        } finally {
            setLoading(false);
        }
        }

        void loadTors();
    }, []);

    const myTors = useMemo(
        () => tors.filter(isVisibleInMyTor),
        [tors]
    );

    const visibleTors = useMemo(() => {
        const keyword = query.trim().toLocaleLowerCase("th");
    
        return myTors
            .filter((tor) => {
                const status = getStatus(tor);
    
                if (
                    statusFilter !== "all" &&
                    status !== statusFilter
                ) {
                    return false;
                }
    
                if (!keyword) return true;
    
                return `${tor.projectName} ${tor.agencyName}`
                    .toLocaleLowerCase("th")
                    .includes(keyword);
            })
            .sort(
                (a, b) =>
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
    }, [myTors, query, statusFilter]);

    async function handleView(tor: Tor) {
        try {
            setDetailLoading(true);
            setError("");

            const detail = await getTorById(tor._id);
            setSelectedTor(detail);
        } catch (err) {
        showToast(
            err instanceof Error
                ? err.message
                : "โหลดรายละเอียดไม่สำเร็จ",  "error"
        );
        } finally {
            setDetailLoading(false);
        }
    }

    async function handlePublish() {
        if (!publishTarget || !applicationDeadline) {
            showToast("กรุณาเลือกวันปิดรับสมัคร", "error");
            return;
        }

        // Date input ใช้วันที่ไทย โดยกำหนดเวลาปิด 23:59:59
        const deadline = new Date(
            `${applicationDeadline}T23:59:59+07:00`
        );

        if (
            Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()
        ) {
            showToast(
                "วันปิดรับสมัครต้องเป็นวันที่ในอนาคต",
                "error"
            );
            return;
        }

        try {
            setBusy(true);

            const updated = await publishTor(
                publishTarget._id,
                deadline.toISOString()
            );

            setTors((current) =>
                current.map((tor) =>
                tor._id === updated._id ? updated : tor
                )
            );

            setPublishTarget(null);
            setApplicationDeadline("");

            showToast("เผยแพร่ TOR สำเร็จ");
        } catch (err) {
            showToast(
                err instanceof Error
                ? err.message
                : "เผยแพร่ TOR ไม่สำเร็จ",
                "error"
            );
        } finally {
            setBusy(false);
        }
    }

    async function handleDelete() {
        if (!deleteTarget) return;

        try {
            setBusy(true);

            await deleteTor(deleteTarget._id);

            setTors((current) =>
                current.filter(
                (tor) => tor._id !== deleteTarget._id
                )
            );

            setDeleteTarget(null);
            showToast("ลบ TOR สำเร็จ");
        } catch (err) {
            showToast(
                err instanceof Error
                ? err.message
                : "ลบ TOR ไม่สำเร็จ",
                "error"
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="myTOR-layout">
            <Sidebar />

            <main className="myTOR-main">
                <header className="myTOR-header">
                    <p>เจ้าของโครงการ</p>
                    <h1>TOR ของฉัน</h1>
                    <span>
                        จัดการ TOR ที่เผยแพร่และตรวจสอบโครงการที่ปิดรับแล้ว
                    </span>
                </header>

                <section className="myTOR-content">
                    <div className="myTOR-toolbar">
                        <div className="myTOR-search">
                            <Search size={18} />
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="ค้นหาชื่อโครงการหรือหน่วยงาน..."
                            />
                        </div>

                        <div className="myTOR-select">
                            <select
                                value={statusFilter}
                                onChange={(e) =>
                                setStatusFilter(
                                    e.target.value as FilterStatus
                                )
                                }
                            >
                                <option value="all">ทุกสถานะ</option>
                                <option value="draft">ยังไม่เผยแพร่</option>
                                <option value="published">เผยแพร่แล้ว</option>
                                <option value="closed">ปิดรับแล้ว</option>
                            </select>
                            <ChevronDown size={16} />
                        </div>

                        <button
                            className="myTOR-reset"
                            onClick={() => {
                                setQuery("");
                                setStatusFilter("all");
                            }}
                        >
                            <RotateCcw size={16} />
                            ล้างตัวกรอง
                        </button>
                    </div>

                    <div className="myTOR-count">
                        พบ {visibleTors.length} โครงการ
                    </div>

                    {error && (
                        <div className="myTOR-error">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="myTOR-empty">
                            กำลังโหลด TOR...
                        </div>
                    ) : visibleTors.length === 0 ? (
                        <div className="myTOR-empty">
                            <FileText size={34} />
                            <h3>ไม่พบ TOR</h3>
                            <p>ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ</p>
                        </div>
                    ) : (
                        <div className="myTOR-list">
                            {visibleTors.map((tor) => {
                                const status = getStatus(tor);
                                const daysLeft = getDaysLeft(
                                    tor.applicationDeadline
                                );

                                return (
                                    <article
                                        key={tor._id}
                                        className="myTOR-card"
                                    >
                                        <div className="myTOR-card-top">
                                            <div className="myTOR-card-info">
                                                <span
                                                    className={`myTOR-status ${status}`}
                                                >
                                                    {statusLabel(status)}
                                                </span>

                                                    <h2>{tor.projectName}</h2>
                                                    <p>
                                                    {tor.agencyName ||
                                                        "ไม่ระบุหน่วยงาน"}
                                                    </p>
                                            </div>

                                            <div className="myTOR-actions">
                                                <button
                                                    onClick={() => handleView(tor)}
                                                    disabled={detailLoading}
                                                >
                                                    <Eye size={16} />
                                                    ดูรายละเอียด
                                                </button>

                                                {status === "draft" && (
                                                    <button
                                                        className="publish"
                                                        onClick={() => {
                                                            setPublishTarget(tor);
                                                            setApplicationDeadline("");
                                                        }}
                                                    >
                                                        <Send size={16} />
                                                        เปิดเป็น Publish
                                                    </button>
                                                )}

                                                <button
                                                    className="danger"
                                                    onClick={() =>
                                                        setDeleteTarget(tor)
                                                    }
                                                >
                                                    <Trash2 size={16} />
                                                    ลบ
                                                </button>
                                            </div>
                                        </div>

                                        <div className="myTOR-meta">
                                            <div>
                                                <small>งบประมาณ</small>
                                                <strong>
                                                    {formatBudget(tor.budget)}
                                                </strong>
                                            </div>

                                            <div>
                                                <small>
                                                    {status === "draft"
                                                        ? "วันปิดรับข้อเสนอ"
                                                        : "วันปิดรับสมัคร"}
                                                </small>

                                                <strong>
                                                    {formatDate(
                                                        status === "draft"
                                                            ? tor.submissionDeadline
                                                            : tor.applicationDeadline
                                                    )}
                                                </strong>
                                            </div>

                                            {status === "published" &&
                                                daysLeft !== null && (
                                                    <span
                                                        className={`myTOR-days ${
                                                        daysLeft <= 7
                                                            ? "closing"
                                                            : "open"
                                                        }`}
                                                    >
                                                        <Clock3 size={14} />
                                                        {daysLeft === 0
                                                            ? "ปิดรับวันนี้"
                                                            : `เหลืออีก ${daysLeft} วัน`}
                                                    </span>
                                                )
                                            }

                                            {status === "closed" && (
                                                <span className="myTOR-days closed">
                                                    <Clock3 size={14} />
                                                    หมดเขตรับสมัคร
                                                </span>
                                            )}

                                            <div>
                                                <small>เผยแพร่เมื่อ</small>
                                                <strong>
                                                    {formatDateTime(
                                                        tor.publishedAt
                                                    )}
                                                </strong>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            </main>

            {/* Detail modal */}
            {selectedTor && (
                <div
                    className="myTOR-overlay"
                    onClick={() => setSelectedTor(null)}
                >
                    <div
                        className="myTOR-modal detail"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="myTOR-modal-header">
                            <div>
                                <span>รายละเอียด TOR</span>
                                <h2>{selectedTor.projectName}</h2>
                                <p>{selectedTor.agencyName}</p>
                            </div>

                            <button
                                onClick={() => setSelectedTor(null)}
                                aria-label="ปิด"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="myTOR-modal-body">
                            <div className="myTOR-detail-grid">
                                <div>
                                    <small>งบประมาณ</small>
                                    <strong>
                                        {formatBudget(selectedTor.budget)}
                                    </strong>
                                </div>

                                <div>
                                    <small>
                                        {getStatus(selectedTor) === "draft"
                                            ? "วันปิดรับข้อเสนอ"
                                            : "วันปิดรับสมัคร"}
                                    </small>

                                    <strong>
                                        {formatDate(
                                            getStatus(selectedTor) === "draft"
                                                ? selectedTor.submissionDeadline
                                                : selectedTor.applicationDeadline
                                        )}
                                    </strong>
                                </div>

                                <div>
                                    <small>สถานะ</small>
                                    <strong>
                                        {statusLabel(getStatus(selectedTor))}
                                    </strong>
                                </div>
                            </div>
                            <h3>รายละเอียดโครงการ</h3>
                            <p>
                                {selectedTor.description ||
                                "ไม่มีรายละเอียด"}
                            </p>

                            <h3>วัตถุประสงค์</h3>
                            {selectedTor.objectives.length ? (
                                <ul>
                                    {selectedTor.objectives.map((item, i) => (
                                        <li key={i}>{item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p>ไม่ระบุ</p>
                            )}

                            <h3>ขอบเขตงาน</h3>
                            {selectedTor.scopeOfWork.length ? (
                                <ul>
                                    {selectedTor.scopeOfWork.map((item, i) => (
                                        <li key={i}>{item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p>ไม่ระบุ</p>
                            )}

                            <h3>คุณสมบัติที่ต้องการ</h3>
                            {selectedTor.requirements.length ? (
                                <div className="myTOR-requirements">
                                    {selectedTor.requirements.map(
                                        (req, i) => (
                                        <div key={i}>
                                            <span>{req.description}</span>
                                            <small>
                                                {req.mandatory
                                                    ? "บังคับ"
                                                    : `น้ำหนัก ${req.weight}%`}
                                            </small>
                                        </div>
                                        )
                                    )}
                                </div>
                            ) : (
                                <p>ไม่ระบุ</p>
                            )}

                            <h3>ข้อมูลติดต่อ</h3>
                            <p>
                                {selectedTor.contactName || "ไม่ระบุ"}
                                {" — "}
                                {selectedTor.contactEmail || "ไม่ระบุ"}
                            </p>
                        </div>

                        <div className="myTOR-modal-footer">
                            <button
                                onClick={() => setSelectedTor(null)}
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Publish modal */}
            {publishTarget && (
                <div
                    className="myTOR-overlay"
                    onClick={() => !busy && setPublishTarget(null)}
                >
                    <div
                        className="myTOR-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="myTOR-modal-header">
                            <div>
                                <span>เผยแพร่ TOR</span>
                                <h2>กำหนดวันปิดรับสมัคร</h2>
                                <p>{publishTarget.projectName}</p>
                            </div>

                            <button
                                disabled={busy}
                                onClick={() => setPublishTarget(null)}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="myTOR-modal-body">
                            <label className="myTOR-field">
                                วันปิดรับสมัคร
                                <input
                                    type="date"
                                    value={applicationDeadline}
                                    min={getTodayInBangkok()}
                                    onChange={(e) =>
                                        setApplicationDeadline(e.target.value)
                                    }
                                />
                            </label>

                            <p className="myTOR-hint">
                                เมื่อเผยแพร่แล้ว TOR จะปรากฏใน
                                Contractor TOR Market และหายจากหน้า
                                TOR ร่างของฉัน
                            </p>
                        </div>

                        <div className="myTOR-modal-footer">
                            <button
                                disabled={busy}
                                onClick={() => setPublishTarget(null)}
                            >
                                ยกเลิก
                            </button>

                            <button
                                className="confirm"
                                disabled={busy || !applicationDeadline}
                                onClick={handlePublish}
                            >
                                <Send size={16} />
                                {busy ? "กำลังเผยแพร่..." : "ยืนยันเผยแพร่"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirmation */}
            {deleteTarget && (
                <div
                    className="myTOR-overlay"
                    onClick={() => !busy && setDeleteTarget(null)}
                >
                    <div
                        className="myTOR-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="myTOR-modal-header">
                            <div>
                                <span>ยืนยันการลบ</span>
                                <h2>ต้องการลบ TOR นี้หรือไม่?</h2>
                                <p>{deleteTarget.projectName}</p>
                            </div>

                            <button
                                disabled={busy}
                                onClick={() => setDeleteTarget(null)}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="myTOR-modal-body">
                            <p>
                                การลบ TOR จะทำให้โครงการนี้หายจาก
                                My TOR และ Contractor TOR Market
                                และไม่สามารถกู้คืนได้
                            </p>
                        </div>

                        <div className="myTOR-modal-footer">
                            <button
                                disabled={busy}
                                onClick={() => setDeleteTarget(null)}
                            >
                                ยกเลิก
                            </button>
                            
                            <button
                                className="delete"
                                disabled={busy}
                                onClick={handleDelete}
                            >
                                <Trash2 size={16} />
                                {busy ? "กำลังลบ..." : "ยืนยันลบ"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
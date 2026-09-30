"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sideBar";
import { useToast } from "@/components/toast/ToastProvider";
import {
    FilePenLine,
    Plus,
    Search,
    Trash2,
    MessageCircle,
    X,
} from "lucide-react";
import {
    deleteTor,
    getDraftTors,
    getComments,
} from "@/lib/torApi";
import type { Comment } from "@/lib/torApi";
import type { Tor } from "@/types/tor";
import "./draft_TOR.css";

export default function DraftTOR() {
    const router = useRouter();
    const { showToast } = useToast();
    const [tors, setTors] = useState<Tor[]>([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deletingId, setDeletingId] = useState("");
    const [commentTor, setCommentTor] = useState<Tor | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentLoading, setCommentLoading] = useState(false);
    const [commentError, setCommentError] = useState("");

    useEffect(() => {
        getDraftTors().then(setTors).catch((err) => setError(err instanceof Error ? err.message : "โหลดรายการไม่สำเร็จ")).finally(() => setLoading(false));
    }, []);

    const visibleTors = useMemo(() => {
        const keyword = query.trim().toLocaleLowerCase("th");
        return keyword ? tors.filter((tor) => `${tor.projectName} ${tor.agencyName}`.toLocaleLowerCase("th").includes(keyword)) : tors;
    }, [query, tors]);

    async function handleDelete(tor: Tor) {
        setDeletingId(tor._id);
        setError("");
        try {
            await deleteTor(tor._id);
            setTors((current) => current.filter((item) => item._id !== tor._id));
            showToast("ลบ TOR ฉบับร่างสำเร็จ");
        } catch (err) {
            const message = err instanceof Error ? err.message : "ลบ TOR ไม่สำเร็จ";
            setError(message);
            showToast(message, "error");
        } finally {
            setDeletingId("");
        }
    }

    async function handleViewComments(tor: Tor) {
        setCommentTor(tor);
        setComments([]);
        setCommentError("");
        setCommentLoading(true);
    
        try {
            const data = await getComments(tor._id);
            setComments(data);
        } catch (err) {
            setCommentError(
                err instanceof Error
                    ? err.message
                    : "ไม่สามารถโหลดความคิดเห็นได้"
            );
        } finally {
            setCommentLoading(false);
        }
    }

    return (
        <div className="draftTOR-layout">
            <Sidebar />
            <main className="draftTOR-main">
                <header className="draftTOR-header">
                    <div><p>เจ้าของโครงการ</p><h1>TOR ร่างของฉัน</h1><span>จัดการและแก้ไข TOR ก่อนส่งตรวจสอบ</span></div>
                    <button onClick={() => router.push("/project_own/create_TOR")}><Plus size={17} /> สร้าง TOR</button>
                </header>
                <div className="draftTOR-toolbar"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อโครงการหรือหน่วยงาน" /><span>{visibleTors.length} รายการ</span></div>
                {error && <div className="draftTOR-error">{error}</div>}
                {loading ? <div className="draftTOR-state">กำลังโหลดข้อมูล...</div> : visibleTors.length === 0 ? (
                    <div className="draftTOR-state"><FilePenLine size={36} /><h2>{query ? "ไม่พบ TOR ที่ค้นหา" : "ยังไม่มี TOR ฉบับร่าง"}</h2><p>{query ? "ลองใช้คำค้นหาอื่น" : "เริ่มสร้าง TOR แล้วบันทึกเป็นฉบับร่างได้ทันที"}</p>{!query && <button onClick={() => router.push("/project_own/create_TOR")}>สร้าง TOR แรก</button>}</div>
                ) : (
                    <div className="draftTOR-list">{visibleTors.map((tor) => (
                        <article className="draftTOR-card" key={tor._id}>
                            <div className="draftTOR-cardTop">
                                <div>
                                    <span className="draftTOR-badge">
                                        ฉบับร่าง
                                    </span>
                                    <h2>
                                        {tor.projectName}
                                    </h2>
                                    <p>
                                        {tor.agencyName}
                                    </p>
                                </div>
                                
                                <div className="draftTOR-cardActions">

                                    <button
                                        onClick={() => handleViewComments(tor)}
                                    >
                                        <MessageCircle size={16} />
                                        ความคิดเห็น
                                    </button>

                                    <button
                                        onClick={() =>
                                            router.push(
                                                `/project_own/draft_TOR/${tor._id}/edit`
                                            )
                                        }
                                    >
                                        <FilePenLine size={16} />
                                        แก้ไข
                                    </button>

                                    <button
                                        className="danger"
                                        disabled={deletingId === tor._id}
                                        onClick={() => handleDelete(tor)}
                                    >
                                        <Trash2 size={16} />
                                        {deletingId === tor._id
                                            ? "กำลังลบ"
                                            : "ลบ"}
                                    </button>

                                </div>
                            </div>

                            <div className="draftTOR-meta">
                                <span>
                                    งบประมาณ 
                                    <b>{tor.budget == null ? "ไม่ระบุ" : `${tor.budget.toLocaleString("th-TH")} บาท`}</b>
                                </span>
                                
                                <span>
                                    แก้ไขล่าสุด 
                                    <b>{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(tor.updatedAt))}</b>
                                </span>
                            </div>
                        </article>
                    ))}</div>
                )}
            </main>
            {commentTor && (
                <div
                    className="comment-modal-overlay"
                    onClick={() => setCommentTor(null)}
                >
                    <div
                        className="comment-modal"
                        onClick={(e) => e.stopPropagation()}
                    >

                        <div className="comment-modal-header">

                            <div>
                                <h2>ความคิดเห็น</h2>
                                <p>{commentTor.projectName}</p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setCommentTor(null)}
                            >
                                <X size={20} />
                            </button>

                        </div>

                        <div className="comment-modal-body">

                            {commentError && (
                                <div className="draftTOR-error">
                                    {commentError}
                                </div>
                            )}

                            {commentLoading ? (
                                <div className="comment-empty">
                                    กำลังโหลดความคิดเห็น...
                                </div>
                            ) : comments.length === 0 ? (
                                <div className="comment-empty">
                                    <MessageCircle size={32} />
                                    <p>ยังไม่มีความคิดเห็น</p>
                                </div>
                            ) : (
                                <div className="comment-list">

                                    {comments.map((comment) => (
                                        <div
                                            key={comment._id}
                                            className="comment-item"
                                        >
                                            <div className="comment-avatar">
                                                {comment.userName
                                                    .charAt(0)
                                                    .toUpperCase()}
                                            </div>

                                            <div className="comment-content">

                                                <div className="comment-item-header">
                                                    <strong>
                                                        {comment.userName}
                                                    </strong>

                                                    <span>
                                                        {new Intl.DateTimeFormat(
                                                            "th-TH",
                                                            {
                                                                dateStyle: "medium",
                                                                timeStyle: "short",
                                                            }
                                                        ).format(
                                                            new Date(
                                                                comment.createdAt
                                                            )
                                                        )}
                                                    </span>
                                                </div>

                                                <p>
                                                    {comment.content}
                                                </p>

                                            </div>
                                        </div>
                                    ))}

                                </div>
                            )}

                        </div>

                        <div className="comment-modal-footer">
                            <button
                                type="button"
                                onClick={() => setCommentTor(null)}
                            >
                                ปิด
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}

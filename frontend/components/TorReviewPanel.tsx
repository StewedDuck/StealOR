"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Clock3, Info, MessageSquare, Pencil, UserRound, X } from "lucide-react";
import Link from "next/link";
import type { Tor } from "@/types/tor";
import { submitTorReview } from "@/lib/torApi";
import { reviewAdminTor } from "@/lib/adminApi";
import ownerStyles from "./TorReviewPanel.module.css";
import legacyStyles from "./TorReviewPanelLegacy.module.css";

export const reviewLabels = {
    not_submitted: "ยังไม่ส่งตรวจ", pending: "รอผู้ดูแลตรวจสอบ",
    changes_requested: "ผู้ดูแลขอแก้ไข", approved: "อนุมัติแล้ว",
};

// ใช้ร่วมกันเฉพาะหน้าเจ้าของ/แอดมิน ไม่ปะปนกับความคิดเห็นผู้รับจ้าง
export default function TorReviewPanel({ tor, role, onUpdated, historyOnly = false }: {
    // หน้าร่างแสดงเฉพาะแถบสถานะและประวัติ โดยใช้ปุ่มส่งตรวจเดิมในการ์ด
    historyOnly?: boolean;
    tor: Tor; role: "owner" | "admin"; onUpdated: (tor: Tor) => void;
}) {
    // Keep the Admin review interface separate from the owner history redesign.
    const styles = role === "admin" ? legacyStyles : ownerStyles;
    const [comment, setComment] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const status = tor.reviewStatus ?? "not_submitted";
    async function act(decision?: "approved" | "changes_requested") {
        setBusy(true); setError("");
        try {
            const updated = role === "owner" ? await submitTorReview(tor._id)
                : await reviewAdminTor(tor._id, decision!, comment, tor.submittedVersion!);
            onUpdated(updated); setComment("");
        } catch (err) { setError(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ"); }
        finally { setBusy(false); }
    }
    const [historyOpen, setHistoryOpen] = useState(false);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const historyTitleId = useId();

    useEffect(() => {
        if (!historyOpen) return;
        // Native dialog keeps focus inside the popup and supports Escape, even above the TOR detail modal.
        const dialog = dialogRef.current;
        dialog?.showModal();
        return () => dialog?.close();
    }, [historyOpen]);

    const entries = [...(tor.reviewHistory ?? [])].reverse();
    const legacyHistory = !!entries.length && <details>
        <summary><ChevronDown size={18} />ประวัติการตรวจ ({entries.length})</summary>
        {entries.map((entry, index) => <article key={index} className={styles.entry} data-status={entry.decision}>
            <div className={styles.entryHeading}>
                <strong>{reviewLabels[entry.decision]} <span>·</span> ฉบับ {entry.version}</strong>
                <span className={styles.decisionBadge}>{entry.decision === "approved" ? "อนุมัติแล้ว" : "ขอแก้ไข"}</span>
            </div>
            <p>{entry.comment || "ไม่มีหมายเหตุ"}</p>
            <small><UserRound size={16} />{entry.reviewedBy}<span>·</span><time dateTime={entry.reviewedAt}>{new Date(entry.reviewedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</time></small>
        </article>)}
    </details>;
    const history = role === "admin" ? legacyHistory : historyOpen && createPortal(
        <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={historyTitleId}
            onCancel={() => setHistoryOpen(false)} onClose={() => setHistoryOpen(false)}
            onClick={event => { if (event.target === event.currentTarget) setHistoryOpen(false); }}>
            <div className={styles.dialogContent}>
                <header className={styles.dialogHeader}>
                    <span className={styles.historyIcon}><Clock3 size={24} /></span>
                    <div>
                        <h2 id={historyTitleId}>ประวัติการตรวจ TOR (Audit History)</h2>
                        <p>บันทึกขั้นตอนการพิจารณาตรวจสอบและอนุมัติเอกสาร</p>
                    </div>
                    <button type="button" className={styles.closeButton} aria-label="ปิดประวัติการตรวจ" onClick={() => setHistoryOpen(false)}><X size={24} /></button>
                </header>
                <div className={styles.timeline}>
                    {entries.length ? entries.map((entry, index) => <article key={index} className={styles.entry} data-status={entry.decision}>
                        <span className={styles.timelineIcon}>{entry.decision === "approved" ? <Check size={20} /> : <MessageSquare size={18} />}</span>
                        <div className={styles.entryHeading}>
                            <strong>{reviewLabels[entry.decision]} · ฉบับ {entry.version}</strong>
                            <span className={styles.decisionBadge}>{entry.decision === "approved" ? "อนุมัติสมบูรณ์" : "ขอแก้ไข"}</span>
                            <time dateTime={entry.reviewedAt}>{new Date(entry.reviewedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</time>
                        </div>
                        <div className={styles.reviewer}><UserRound size={17} /><span>ผู้ตรวจสอบ:</span><span className={styles.reviewerName}>{entry.reviewedBy}</span></div>
                        <div className={styles.note}><b>หมายเหตุ:</b> {entry.comment || <em>ไม่มีหมายเหตุ</em>}</div>
                    </article>) : <p className={styles.empty}>ยังไม่มีประวัติการตรวจสอบ</p>}
                </div>
            </div>
        </dialog>, document.body);
    const statusBar = <div className={styles.statusBar}>
        <div className={styles.statusLabel}>สถานะการตรวจ: <span className={styles.badge} data-status={status}>{status === "approved" && <Check size={17} />}{reviewLabels[status]}</span></div>
        <button type="button" className={styles.historyButton} onClick={() => setHistoryOpen(true)}><Clock3 size={19} />ประวัติการตรวจ <span className={styles.count}>{entries.length}</span></button>
    </div>;
    if (historyOnly && role === "admin") return legacyHistory ? <div className={styles.history}>{legacyHistory}</div> : null;
    if (historyOnly) return <div className={styles.history}>{statusBar}{history}</div>;
    return <section className={styles.panel} aria-label="การตรวจสอบ TOR" aria-busy={busy}>
        {role === "admin" ? <div className={styles.panelHeader}>
            <h3>การตรวจสอบ TOR</h3>
            <div className={styles.currentStatus}>สถานะปัจจุบัน: <span className={styles.badge} data-status={status}>
                {status === "approved" ? <Check size={18} /> : status === "changes_requested" ? <Pencil size={18} /> : <Clock3 size={18} />}
                {reviewLabels[status]}
            </span></div>
        </div> : statusBar}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {/* ซ่อนการกระทำที่ไม่ตรงสถานะ แต่ backend ยังคงเป็นผู้บังคับสิทธิ์จริง */}
        {role === "owner" && tor.status === "draft" && <>
            {(status === "not_submitted" || status === "changes_requested") &&
                <button type="button" disabled={busy || status === "changes_requested"} onClick={() => act()}>{busy ? "กำลังส่ง..." : "ส่งให้ผู้ดูแลตรวจสอบ"}</button>}
            {/* ขอแก้ไขต้องแก้เนื้อหาจริงก่อน ไม่ให้กดส่งฉบับเดิมซ้ำ */}
            {status === "changes_requested" && <p>กรุณาแก้ไขและบันทึก TOR ก่อนส่งตรวจอีกครั้ง</p>}
            {status === "pending" && <p>ส่งตรวจแล้ว ระหว่างนี้ยังแก้ไขไม่ได้ กรุณารีเฟรชหน้าเพื่อดูผลตรวจล่าสุด</p>}
            {status === "approved" && <><p>พร้อมเผยแพร่ หากแก้ไขเนื้อหาจะต้องส่งตรวจใหม่</p><Link href="/project_own/my_TOR">ไปเผยแพร่ TOR</Link></>}
        </>}
        {role === "admin" && tor.status === "draft" && status === "pending" && <>
            <label>ผลการตรวจ / เหตุผลที่ขอแก้ไข <span className={styles.labelHint}>(กรุณาระบุข้อเสนอแนะเพื่อให้ผู้จัดทำแก้ไขได้อย่างถูกต้อง)</span>
                <textarea value={comment} maxLength={5000} onChange={e => setComment(e.target.value)} disabled={busy} rows={4} />
            </label>
            <div className={styles.actions}>
                <button type="button" className={styles.approveButton} disabled={busy || !tor.submittedVersion} onClick={() => act("approved")}><Check size={20} />อนุมัติพร้อมเผยแพร่</button>
                <button type="button" className={styles.changesButton} disabled={busy || !comment.trim() || !tor.submittedVersion} onClick={() => act("changes_requested")}><Pencil size={20} />ขอแก้ไข</button>
            </div>
            <small className={styles.publishHint}><Info size={18} />การอนุมัติยังไม่เผยแพร่ เจ้าของโครงการต้องกำหนดวันปิดรับสมัครและกดเผยแพร่เอง</small>
        </>}
        {history}

    </section>;
}

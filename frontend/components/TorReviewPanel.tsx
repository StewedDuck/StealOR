"use client";

import { useState } from "react";
import Link from "next/link";
import type { Tor } from "@/types/tor";
import { submitTorReview } from "@/lib/torApi";
import { reviewAdminTor } from "@/lib/adminApi";
import styles from "./TorReviewPanel.module.css";

export const reviewLabels = {
    not_submitted: "ยังไม่ส่งตรวจ", pending: "รอผู้ดูแลตรวจสอบ",
    changes_requested: "ผู้ดูแลขอแก้ไข", approved: "อนุมัติแล้ว",
};

// ใช้ร่วมกันเฉพาะหน้าเจ้าของ/แอดมิน ไม่ปะปนกับความคิดเห็นผู้รับจ้าง
export default function TorReviewPanel({ tor, role, onUpdated, historyOnly = false }: {
    // หน้าร่างใช้โหมดประวัติเท่านั้น เพราะย้ายปุ่มและสถานะไปไว้ในการ์ดแล้ว
    historyOnly?: boolean;
    tor: Tor; role: "owner" | "admin"; onUpdated: (tor: Tor) => void;
}) {
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
    const history = !!tor.reviewHistory?.length && <details>
            <summary>ประวัติการตรวจ ({tor.reviewHistory.length})</summary>
            {[...tor.reviewHistory].reverse().map((entry, index) => <article key={index} className={styles.entry}>
                <strong>{reviewLabels[entry.decision]} · ฉบับ {entry.version}</strong>
                <p>{entry.comment || "ไม่มีหมายเหตุ"}</p>
                <small>{entry.reviewedBy} · {new Date(entry.reviewedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</small>
            </article>)}
        </details>;
    if (historyOnly) return history ? <div className={styles.history}>{history}</div> : null;
    return <section className={styles.panel} aria-label="การตรวจสอบ TOR" aria-busy={busy}>
        <h3>การตรวจสอบ TOR</h3>
        <span className={styles.badge}>{reviewLabels[status]}</span>
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
            <label>ผลการตรวจ / เหตุผลที่ขอแก้ไข
                <textarea value={comment} maxLength={5000} onChange={e => setComment(e.target.value)} disabled={busy} rows={3} />
            </label>
            <div className={styles.actions}>
                <button type="button" disabled={busy || !tor.submittedVersion} onClick={() => act("approved")}>อนุมัติพร้อมเผยแพร่</button>
                <button type="button" disabled={busy || !comment.trim() || !tor.submittedVersion} onClick={() => act("changes_requested")}>ขอแก้ไข</button>
            </div>
            <small>การอนุมัติยังไม่เผยแพร่ เจ้าของโครงการต้องกำหนดวันปิดรับสมัครและกดเผยแพร่เอง</small>
        </>}
        {history}

    </section>;
}

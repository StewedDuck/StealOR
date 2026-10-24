"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TorDetailModal from "@/components/TORDetail";
import Sidebar from "@/components/sideBarAdmin";
import { getAdminTors } from "@/lib/adminApi";
import { type Tor } from "@/types/tor";
import "../manageUser/users.css";
import "./issue.css";

const statusLabels = {
    draft: "ฉบับร่าง",
    pending_verification: "รอตรวจสอบ",
    published: "เผยแพร่แล้ว",
};
const money = (value: number | null | undefined) => value == null ? "—" : `${value.toLocaleString("th-TH")} บาท`;
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" }) : "—";

export default function AdminTorsPage() {
    const [tors, setTors] = useState<Tor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("all");
    const [selected, setSelected] = useState<Tor | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try { setTors(await getAdminTors()); }
        catch (err) { setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const filtered = useMemo(() => {
        // ค้นหาชื่อโครงการหรือชื่อหน่วยงาน โดยรองรับตัวพิมพ์เล็ก/ใหญ่และ Unicode ที่เทียบเท่ากัน
        // ใช้ร่วมกับตัวกรองสถานะ และคำนวณใหม่ทันทีเมื่อพิมพ์หรือเปลี่ยนสถานะ
        const keyword = query.normalize("NFC").trim().toLowerCase();
        return tors.filter(tor => (status === "all" || tor.status === status) &&
            [tor.projectName, tor.agencyName].some(value =>
                (value ?? "").normalize("NFC").toLowerCase().includes(keyword)));
    }, [tors, query, status]);

    return (
        <div className="admin-layout">
            <aside className="admin-sidebar"><Sidebar /></aside>
            <main className="admin-main">
                <div className="admin-users-page admin-tors-page">
                    <header className="admin-users-header">
                        <h1>รายงาน / ร้องเรียน</h1>
                        <p>รายการ TOR ของเจ้าของโครงการทุกคนในระบบ</p>
                    </header>
                    <div className="admin-users-filters">
                        <input aria-label="ค้นหาชื่อโครงการหรือหน่วยงาน" placeholder="ค้นหาชื่อโครงการหรือหน่วยงาน..." value={query} onChange={e => setQuery(e.target.value)} />
                        <select aria-label="สถานะ TOR" value={status} onChange={e => setStatus(e.target.value)}>
                            <option value="all">ทุกสถานะ</option>
                            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <button type="button" onClick={load} disabled={loading}>รีเฟรช</button>
                    </div>
                    <section className="admin-users-card" aria-busy={loading}>
                        <div className="admin-users-card-heading"><h2>TOR ทั้งหมด</h2>{!loading && !error && <p>แสดง {filtered.length} จาก {tors.length} โครงการ</p>}</div>
                        {error ? <p role="alert">{error}</p> : loading ? <p role="status">กำลังโหลดข้อมูล TOR...</p> : (
                            <div className="admin-users-table-wrap">
                                <table className="admin-users-table">
                                    <thead><tr><th>โครงการ / หน่วยงาน</th><th>เจ้าของโครงการ</th><th>งบประมาณ</th><th>สถานะ</th><th>แก้ไขล่าสุด</th><th>รายละเอียด</th></tr></thead>
                                    <tbody>{filtered.map(tor => <tr key={tor._id}>
                                        <td><strong>{tor.projectName}</strong><small>{tor.agencyName}</small></td>
                                        <td>{tor.contactName || "—"}<small>{tor.contactEmail || tor.ownerId}</small></td>
                                        <td>{money(tor.budget)}</td>
                                        <td>{statusLabels[tor.status] ?? tor.status}</td>
                                        <td>{date(tor.updatedAt)}</td>
                                        <td><button type="button" aria-label={`ดูรายละเอียด ${tor.projectName}`} onClick={() => setSelected(tor)}>ดูรายละเอียด</button></td>
                                    </tr>)}</tbody>
                                </table>
                                {filtered.length === 0 && <p className="admin-users-empty">ไม่พบ TOR</p>}
                            </div>
                        )}
                    </section>
                    {/* ใช้หน้ารายละเอียด TOR ร่วมกับหน้าอื่น เพื่อลดการทำ UI ซ้ำ
                        เปิดข้อมูลเจ้าของและวันที่เพิ่มเติมเฉพาะหน้าแอดมิน */}
                    {selected && <TorDetailModal
                        tor={selected}
                        onClose={() => setSelected(null)}
                        showAdminMetadata
                    />}
                </div>
            </main>
        </div>
    );
}

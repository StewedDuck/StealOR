"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FilterDropdown from "@/components/FilterDropdown";
import Sidebar from "@/components/sideBarAdmin";
import "../manageUser/users.css"; 
import "./activity.css";

export type ActivityLog = {
    _id: string;
    createdAt: string;
    category: "user" | "tor" | "system" | "security";
    actorName: string;
    action: string;
    details?: string;
};

const categoryLabels = {
    user: "ผู้ใช้งาน",
    tor: "เอกสาร TOR",
    system: "ระบบอัตโนมัติ",
    security: "ความปลอดภัย",
};

const date = (value: string | null | undefined) => 
    value ? new Date(value).toLocaleDateString("th-TH", { 
        year: 'numeric', month: 'short', day: 'numeric', 
        hour: '2-digit', minute:'2-digit', timeZone: "Asia/Bangkok" 
    }) : "—";

// ฟังก์ชันดึงข้อมูลจาก API จริง
// แก้ไขฟังก์ชัน fetchRealLogs ใน frontend/app/admin/activity/page.tsx
const fetchRealLogs = async (category: string, query: string): Promise<ActivityLog[]> => {
    const params = new URLSearchParams();
    if (category !== "all") params.append("category", category);
    if (query) params.append("search", query);

    // เปลี่ยนมายิงผ่าน Next.js API Route ของตัวเอง
    const res = await fetch(`/api/admin/logs?${params.toString()}`);
    
    if (!res.ok) {
        throw new Error("ไม่สามารถดึงข้อมูลบันทึกกิจกรรมได้");
    }
    
    const json = await res.json();
    return json.data; 
};

export default function AdminActivityPage() {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("all");

    // ฟังก์ชันโหลดข้อมูล (ดึง API ใหม่ทุกครั้งที่เปลี่ยน Filter หรือ Search)
    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try { 
            const data = await fetchRealLogs(category, query); 
            setLogs(data);
        }
        catch (err) { 
            setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); 
        }
        finally { 
            setLoading(false); 
        }
    }, [category, query]);

    // โหลดข้อมูลครั้งแรก และโหลดใหม่เมื่อ category หรือ query เปลี่ยนแปลง
    useEffect(() => { 
        // ดีเลย์นิดหน่อยกันการยิง API รัวๆ ตอนพิมพ์ค้นหา (Debounce)
        const timeoutId = setTimeout(() => {
            void load();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [load]);

    // ฟังก์ชันจัดเรียง/ค้นหาซ้ำในฝั่ง Frontend เพื่อความรวดเร็ว
    const filtered = useMemo(() => {
        const keyword = query.normalize("NFC").trim().toLowerCase();
        return logs.filter(log => 
            (category === "all" || log.category === category) &&
            [log.actorName, log.action, log.details].some(value =>
                (value ?? "").normalize("NFC").toLowerCase().includes(keyword)
            )
        );
    }, [logs, query, category]);

    return (
        <div className="admin-layout">
            <aside className="admin-sidebar"><Sidebar /></aside>
            <main className="admin-main">
                <div className="admin-users-page admin-activity-page">
                    
                    <header className="admin-users-header">
                        <h1>บันทึกกิจกรรม</h1>
                        <p>ประวัติการทำงานของระบบอัตโนมัติและการดำเนินการของผู้ดูแลระบบ</p>
                    </header>

                    <div className="admin-users-filters">
                        <input 
                            aria-label="ค้นหากิจกรรม" 
                            placeholder="ค้นหาชื่อผู้ทำ, หรือเหตุการณ์..." 
                            value={query} 
                            onChange={e => setQuery(e.target.value)} 
                        />
                        <FilterDropdown 
                            value={category} 
                            onChange={setCategory}
                            options={[
                                { value: "all", label: "ทุกหมวดหมู่" },
                                ...Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))
                            ]} 
                        />
                        <button type="button" onClick={load} disabled={loading}>รีเฟรช</button>
                    </div>

                    <section className="admin-users-card" aria-busy={loading}>
                        <div className="admin-users-card-heading">
                            <h2>ประวัติทั้งหมด</h2>
                            {!loading && !error && <p>แสดง {filtered.length} จาก {logs.length} รายการ</p>}
                        </div>

                        {error ? <p role="alert" className="text-red-500">{error}</p> : loading && logs.length === 0 ? <p role="status">กำลังโหลดบันทึกกิจกรรม...</p> : (
                            <div className="admin-users-table-wrap">
                                <table className="admin-users-table">
                                    <thead>
                                        <tr>
                                            <th>วัน-เวลา</th>
                                            <th>หมวดหมู่</th>
                                            <th>ผู้ดำเนินการ</th>
                                            <th>เหตุการณ์</th>
                                            <th>รายละเอียด</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(log => (
                                            <tr key={log._id}>
                                                <td>{date(log.createdAt)}</td>
                                                <td>
                                                    <span className={`status-badge ${log.category}`}>
                                                        {categoryLabels[log.category] ?? log.category}
                                                    </span>
                                                </td>
                                                <td><strong>{log.actorName}</strong></td>
                                                <td>{log.action}</td>
                                                <td><small className="text-muted">{log.details || "—"}</small></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filtered.length === 0 && <p className="admin-users-empty">ไม่พบบันทึกกิจกรรม</p>}
                            </div>
                        )}
                    </section>

                </div>
            </main>
        </div>
    );
}

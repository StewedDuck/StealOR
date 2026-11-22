"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import HeaderActions from "@/components/HeaderActions";
import Sidebar from "@/components/sideBarAdmin";
import "../manageUser/users.css";
import "./rss.css";

type RssDepartment = {
  _id: string;
  deptId: string;
  name: string;
  isActive: boolean;
  addedBy?: string;
  createdAt: string;
};

type SyncStatus = {
  isRunning: boolean;
  lastRunAt: string | null;
};

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Bangkok",
      })
    : "—";

export default function AdminRssPage() {
  const [departments, setDepartments] = useState<RssDepartment[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ isRunning: false, lastRunAt: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [deptId, setDeptId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/rss-departments", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "ไม่สามารถโหลดรายการหน่วยงาน RSS ได้");
      }
      setDepartments(json.data.departments ?? []);
      setSyncStatus(json.data.syncStatus ?? { isRunning: false, lastRunAt: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/rss-departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deptId: deptId.trim(), name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "ไม่สามารถเพิ่มหน่วยงานได้");
      }
      setDeptId("");
      setName("");
      setNotice(`เพิ่มหน่วยงาน ${json.data.deptId} - ${json.data.name} เรียบร้อยแล้ว`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มหน่วยงานไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(dept: RssDepartment) {
    setBusyId(dept._id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/rss-departments/${encodeURIComponent(dept._id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !dept.isActive }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "อัปเดตสถานะไม่สำเร็จ");
      }
      setDepartments((prev) => prev.map((d) => (d._id === dept._id ? json.data : d)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปเดตสถานะไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(dept: RssDepartment) {
    if (!window.confirm(`ต้องการลบหน่วยงาน ${dept.deptId} (${dept.name}) ออกจากการดึง RSS หรือไม่?`)) {
      return;
    }
    setBusyId(dept._id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/rss-departments/${encodeURIComponent(dept._id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "ลบหน่วยงานไม่สำเร็จ");
      }
      setDepartments((prev) => prev.filter((d) => d._id !== dept._id));
      setNotice(`ลบหน่วยงาน ${dept.deptId} เรียบร้อยแล้ว`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบหน่วยงานไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/rss-departments/sync-now", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "ไม่สามารถเริ่มซิงค์ RSS ได้");
      }
      setNotice(json.message || "เริ่มซิงค์ข้อมูล RSS ในเบื้องหลังแล้ว (ตรวจสอบผลได้ที่หน้าบันทึกกิจกรรม)");
      setSyncStatus((prev) => ({ ...prev, isRunning: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "สั่งซิงค์ไม่สำเร็จ");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Sidebar />
      </aside>

      <main className="admin-main">
        <div className="admin-users-page admin-rss-page">
          <header className="app-page-header admin-users-header">
            <div className="app-page-heading">
              <h1>จัดการหน่วยงาน RSS (e-GP)</h1>
              <p>กำหนดรหัสหน่วยงานภาครัฐที่ระบบจะดึงประกาศจัดซื้อจัดจ้างอัตโนมัติ (08:00 น. และ 20:00 น.)</p>
            </div>
            <div className="app-page-controls">
              <HeaderActions />
            </div>
          </header>

          <form className="admin-users-filters admin-rss-form" onSubmit={handleAdd}>
            <input
              aria-label="รหัสหน่วยงาน 4 หลัก"
              placeholder="รหัสหน่วยงาน (เช่น 0706)"
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              maxLength={4}
              required
            />
            <input
              aria-label="ชื่อหน่วยงาน"
              placeholder="ชื่อหน่วยงาน (เช่น กรมทางหลวง)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button type="submit" className="admin-rss-btn primary" disabled={saving}>
              {saving ? "กำลังเพิ่ม..." : "+ เพิ่มหน่วยงาน"}
            </button>
            <button
              type="button"
              className="admin-rss-btn"
              onClick={handleSyncNow}
              disabled={syncing || syncStatus.isRunning}
            >
              {syncStatus.isRunning || syncing ? "กำลังซิงค์..." : "ซิงค์ RSS ตอนนี้"}
            </button>
          </form>

          {error && <p role="alert" className="admin-users-error">{error}</p>}
          {notice && <p role="status" className="admin-rss-notice">{notice}</p>}

          <section className="admin-users-card" aria-busy={loading}>
            <div className="admin-users-card-heading">
              <h2>รายการหน่วยงานที่ติดตาม</h2>
              <p>
                ทั้งหมด {departments.length} หน่วยงาน | ซิงค์ล่าสุด: {formatDate(syncStatus.lastRunAt)}
              </p>
            </div>

            {loading ? (
              <p className="admin-users-empty">กำลังโหลดข้อมูล...</p>
            ) : (
              <div className="admin-users-table-wrap">
                <table className="admin-users-table">
                  <thead>
                    <tr>
                      <th>รหัสหน่วยงาน</th>
                      <th>ชื่อหน่วยงาน</th>
                      <th>สถานะ</th>
                      <th>เพิ่มโดย</th>
                      <th>วันที่เพิ่ม</th>
                      <th>การทำงาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map((dept) => (
                      <tr key={dept._id}>
                        <td><strong>{dept.deptId}</strong></td>
                        <td>{dept.name}</td>
                        <td>
                          <span className={`admin-user-badge ${dept.isActive ? "active" : "suspended"}`}>
                            {dept.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                          </span>
                        </td>
                        <td>{dept.addedBy || "system"}</td>
                        <td>{formatDate(dept.createdAt)}</td>
                        <td>
                          <div className="admin-users-actions">
                            <button
                              type="button"
                              disabled={busyId === dept._id}
                              onClick={() => handleToggle(dept)}
                            >
                              {dept.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                            </button>
                            <button
                              type="button"
                              className="admin-rss-delete-btn"
                              disabled={busyId === dept._id}
                              onClick={() => handleDelete(dept)}
                            >
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {departments.length === 0 && (
                  <p className="admin-users-empty">ยังไม่มีหน่วยงานในรายการ</p>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
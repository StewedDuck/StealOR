"use client";

import { useEffect, useMemo, useState } from "react";
import {
    X,
    UserRound,
    Mail,
    Phone,
    Building2,
    ShieldCheck,
    CalendarDays,
    BriefcaseBusiness,
    CircleCheck,
    Info,
} from "lucide-react";

import {
    getAdminUsers,
    updateAdminUserStatus,
    type AdminUser,
} from "@/lib/adminApi";

import "./users.css";
import Sidebar from "@/components/sideBarAdmin";
import FilterDropdown from "@/components/FilterDropdown";

const roleLabels = {
    contractor: "ผู้รับจ้าง",
    project_owner: "เจ้าของโครงการ",
    admin: "ผู้ดูแลระบบ",
};

const verificationLabels = {
    not_required: "—",
    pending: "รอตรวจสอบ",
    approved: "ยืนยันแล้ว",
    rejected: "ไม่ผ่าน",
};

function formatDate(value: string) {
    return new Date(value).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function UserDetailRow({
    icon: Icon,
    label,
    children,
}: {
    icon: React.ElementType;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="user-detail-row">
            <Icon size={18} className="user-detail-icon" />

            <span className="user-detail-label">{label}</span>

            <div className="user-detail-value">{children}</div>
        </div>
    );
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [role, setRole] = useState("all");
    const [status, setStatus] = useState("all");
    const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

    useEffect(() => {
        async function load() {
            try {
                const data = await getAdminUsers();
                setUsers(data);
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"
                );
            } finally {
                setLoading(false);
            }
        }

        load();
    }, []);

    const filteredUsers = useMemo(() => {
        const keyword = query.trim().toLowerCase();

        return users.filter((user) => {
            const matchesQuery =
                user.name.toLowerCase().includes(keyword) ||
                user.email.toLowerCase().includes(keyword);

            const matchesRole =
                role === "all" || user.accountRole === role;

            const matchesStatus =
                status === "all" ||
                (status === "active" && user.isActive) ||
                (status === "suspended" && !user.isActive);

            return matchesQuery && matchesRole && matchesStatus;
        });
    }, [users, query, role, status]);

    async function toggleStatus(user: AdminUser) {
        const action = user.isActive ? "ระงับ" : "เปิดใช้งาน";

        if (!window.confirm(`ต้องการ${action}บัญชี ${user.name} หรือไม่?`)) {
            return;
        }

        setSavingId(user._id);

        try {
            const updated = await updateAdminUserStatus(
                user._id,
                !user.isActive
            );

            setUsers((prev) =>
                prev.map((item) =>
                item._id === updated._id ? updated : item
                )
            );

            setSelectedUser((prev) =>
                prev?._id === updated._id ? updated : prev
            );
        } catch (err) {
            window.alert(
                err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ"
            );
        } finally {
            setSavingId(null);
        }
    }

    return (
        <div className="admin-layout">
            <aside className="admin-sidebar">
                <Sidebar />
            </aside>

            <main className="admin-main">
                <div className="admin-users-page">
                    <header className="admin-users-header">
                        <h1>จัดการผู้ใช้งาน</h1>
                        <p>จัดการผู้รับจ้าง เจ้าของโครงการ และผู้ดูแลระบบ</p>
                    </header>

                    <section className="admin-users-filters">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="ค้นหาผู้ใช้ตามชื่อหรืออีเมล..."
                        />

                        <div className="admin-users-filter-role">
                            <FilterDropdown
                                value={role}
                                onChange={setRole}
                                options={[
                                { value: "all", label: "ทุกบทบาท" },
                                { value: "contractor", label: "ผู้รับจ้าง" },
                                { value: "project_owner", label: "เจ้าของโครงการ" },
                                { value: "admin", label: "ผู้ดูแลระบบ" },
                                ]}
                            />
                        </div>

                        <div className="admin-users-filter-status">
                            <FilterDropdown
                                value={status}
                                onChange={setStatus}
                                options={[
                                { value: "all", label: "ทุกสถานะ" },
                                { value: "active", label: "ใช้งานอยู่" },
                                { value: "suspended", label: "ระงับแล้ว" },
                                ]}
                            />
                        </div>
                    </section>

                    <section className="admin-users-card">
                        <div className="admin-users-card-heading">
                            <h2>การจัดการผู้ใช้งาน</h2>
                            <p>พบ {filteredUsers.length} ผู้ใช้งาน</p>
                        </div>

                        {error && <p className="admin-users-error">{error}</p>}

                        {loading ? (
                            <p className="admin-users-empty">กำลังโหลดข้อมูล...</p>
                            ) : (
                            <div className="admin-users-table-wrap">
                                <table className="admin-users-table">
                                    <thead>
                                        <tr>
                                        <th>ผู้ใช้งาน</th>
                                        <th>บทบาท</th>
                                        <th>สถานะ</th>
                                        <th>การยืนยัน</th>
                                        <th>เข้าร่วมเมื่อ</th>
                                        <th>การทำงาน</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {filteredUsers.map((user) => (
                                            <tr key={user._id}>
                                                <td>
                                                    <strong>{user.name}</strong>
                                                    <small>{user.email}</small>
                                                </td>

                                                <td>{roleLabels[user.accountRole]}</td>

                                                <td>
                                                    <span
                                                        className={`admin-user-badge ${
                                                        user.isActive ? "active" : "suspended"
                                                        }`}
                                                    >
                                                        {user.isActive ? "ใช้งานอยู่" : "ระงับแล้ว"}
                                                    </span>
                                                </td>

                                                <td>
                                                    <span
                                                        className={`admin-user-badge verification-${user.verificationStatus}`}
                                                    >
                                                        {verificationLabels[user.verificationStatus]}
                                                    </span>
                                                </td>

                                                <td>{formatDate(user.createdAt)}</td>

                                                <td>
                                                    <div className="admin-users-actions">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedUser(user)}
                                                        >
                                                            ดู
                                                        </button>

                                                        <button
                                                            type="button"
                                                            disabled={
                                                                savingId === user._id ||
                                                                user.accountRole === "admin"
                                                            }
                                                            onClick={() => toggleStatus(user)}
                                                        >
                                                            {savingId === user._id
                                                                ? "กำลังบันทึก..."
                                                                : user.isActive
                                                                ? "ระงับ"
                                                                : "เปิดใช้งาน"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {filteredUsers.length === 0 && (
                                    <p className="admin-users-empty">
                                        ไม่พบผู้ใช้งาน
                                    </p>
                                )}
                            </div>
                        )}
                    </section>

                    {selectedUser && (
                        <div
                            className="admin-users-overlay"
                            onClick={() => setSelectedUser(null)}
                        >
                            <div
                                className="admin-users-modal"
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="user-detail-title"
                                onClick={(e) => e.stopPropagation()}
                            >

                                {/* Header */}
                                <div className="user-modal-header">
                                    <div className="user-modal-title">
                                        <div className="user-modal-title-icon">
                                            <UserRound size={23} />
                                        </div>

                                        <div>
                                            <h2 id="user-detail-title">รายละเอียดผู้ใช้งาน</h2>
                                            <p>ข้อมูลบัญชีและสถานะของผู้ใช้งาน</p>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className="user-modal-close"
                                        aria-label="ปิด"
                                        onClick={() => setSelectedUser(null)}
                                    >
                                        <X size={19} />
                                    </button>
                                </div>

                                {/* Profile */}
                                <div className="user-modal-profile">
                                    <div className="user-modal-avatar">
                                        {getInitials(selectedUser.name)}
                                    </div>

                                    <div className="user-modal-profile-info">
                                        <h3>{selectedUser.name}</h3>

                                        <p>
                                            <Mail size={15} />
                                            {selectedUser.email}
                                        </p>

                                        <div className="user-modal-badges">
                                            <span className="user-modal-role">
                                                <BriefcaseBusiness size={13} />
                                                {roleLabels[selectedUser.accountRole]}
                                            </span>

                                            <span
                                                className={`user-modal-status ${
                                                    selectedUser.isActive ? "active" : "suspended"
                                                }`}
                                            >
                                                <CircleCheck size={13} />
                                                {selectedUser.isActive
                                                    ? "ใช้งานอยู่"
                                                    : "ระงับแล้ว"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Details */}
                                <div className="user-modal-details">

                                    <UserDetailRow icon={UserRound} label="ชื่อ-นามสกุล">
                                        {selectedUser.name}
                                    </UserDetailRow>

                                    <UserDetailRow icon={Mail} label="อีเมล">
                                    {   selectedUser.email}
                                    </UserDetailRow>

                                    <UserDetailRow icon={Phone} label="เบอร์โทร">
                                        {selectedUser.phone || "—"}
                                    </UserDetailRow>

                                    <UserDetailRow icon={Building2} label="บริษัท">
                                        {selectedUser.company || "—"}
                                    </UserDetailRow>

                                    <UserDetailRow
                                        icon={BriefcaseBusiness}
                                        label="บทบาท"
                                    >
                                        {roleLabels[selectedUser.accountRole]}
                                    </UserDetailRow>

                                    <UserDetailRow
                                        icon={ShieldCheck}
                                        label="การยืนยันตัวตน"
                                    >
                                        <span
                                            className={`admin-user-badge verification-${selectedUser.verificationStatus}`}
                                        >
                                            {verificationLabels[selectedUser.verificationStatus]}
                                        </span>
                                    </UserDetailRow>

                                    <UserDetailRow
                                        icon={CircleCheck}
                                        label="สถานะบัญชี"
                                    >
                                        <span
                                            className={`admin-user-badge ${
                                            selectedUser.isActive ? "active" : "suspended"
                                            }`}
                                        >
                                            {selectedUser.isActive
                                            ? "ใช้งานอยู่"
                                            : "ระงับแล้ว"}
                                        </span>
                                    </UserDetailRow>

                                    <UserDetailRow
                                        icon={CalendarDays}
                                        label="เข้าร่วมเมื่อ"
                                    >
                                        {formatDate(selectedUser.createdAt)}
                                    </UserDetailRow>
                                </div>

                                {/* Information */}
                                <div className="user-modal-notice">
                                    <Info size={17} />

                                    <p>
                                        ข้อมูลนี้ดึงจากฐานข้อมูลผู้ใช้งานจริง
                                        และแสดงตามข้อมูลที่บันทึกไว้ในระบบ
                                    </p>
                                </div>

                                {/* Footer */}
                                <div className="user-modal-footer">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedUser(null)}
                                    >
                                        ปิด
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
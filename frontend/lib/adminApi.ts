import type { Tor } from "@/types/tor";

export type AdminUser = {
    _id: string;
    name: string;
    email: string;
    image?: string | null;
    phone?: string;
    company?: string;
    accountRole: "contractor" | "project_owner" | "admin";
    verificationStatus:
        | "not_required"
        | "pending"
        | "approved"
        | "rejected";
    isActive: boolean;
    createdAt: string;
};

async function request<T>(
    path: string,
    init?: RequestInit
): Promise<T> {
    const response = await fetch(
        `/api/admin/users${path}`,
        {
            ...init,
            cache: "no-store",
            headers: {
                "Content-Type": "application/json",
                ...init?.headers,
            },
        }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
            throw new Error(
            result.error ?? "เกิดข้อผิดพลาดในการเชื่อมต่อ API"
        );
    }

    return result.data as T;
}

export function getAdminUsers() {
    return request<AdminUser[]>("");
}

export function getAdminUserById(id: string) {
    return request<AdminUser>(
        `/${encodeURIComponent(id)}`
    );
}

export function updateAdminUserStatus(
        id: string,
        isActive: boolean
) {
    return request<AdminUser>(
        `/${encodeURIComponent(id)}/status`,
        {
            method: "PATCH",
            body: JSON.stringify({ isActive }),
        }
    );
}

export async function getAdminTors(): Promise<Tor[]> {
    const response = await fetch("/api/admin/tors", { cache: "no-store" });
    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`ไม่สามารถโหลด TOR ได้: API ส่งข้อมูลที่ไม่ใช่ JSON (HTTP ${response.status})`);
    }
    if (!response.ok || !result.success) {
        throw new Error(result.error ?? "ไม่สามารถโหลดข้อมูล TOR ได้");
    }
    if (!Array.isArray(result.data)) {
        throw new Error("รูปแบบข้อมูลรายการ TOR ไม่ถูกต้อง");
    }
    return result.data;
}

// version ต้องมาจาก TOR ที่แอดมินอ่าน เพื่อไม่อนุมัติฉบับที่ถูกเปลี่ยนไปแล้ว
export async function reviewAdminTor(id: string, decision: "approved" | "changes_requested", comment: string, version: number): Promise<Tor> {
    const response = await fetch(`/api/admin/tors/${encodeURIComponent(id)}/review`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment, version }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error ?? "บันทึกผลตรวจไม่สำเร็จ");
    return result.data;
}

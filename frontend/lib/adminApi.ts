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
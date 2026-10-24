import { NextRequest, NextResponse } from "next/server";
import { auth, isAdminGmail } from "@/lib/auth";

async function handler(
    req: NextRequest,
    context: { params: Promise<{ path?: string[] }> }
) {
    const session = await auth();
    const email = session?.user?.email?.trim().toLowerCase();

    if (!email) {
        return NextResponse.json(
            { success: false, error: "กรุณาเข้าสู่ระบบ" },
            { status: 401 }
        );
    }

    if (!isAdminGmail(email)) {
        return NextResponse.json(
            { success: false, error: "เฉพาะผู้ดูแลระบบเท่านั้น" },
            { status: 403 }
        );
    }

    const secret = process.env.TOR_PROXY_SECRET;

    if (!secret) {
        return NextResponse.json(
            { success: false, error: "Admin API is not configured" },
            { status: 500 }
        );
    }

    const base =
        process.env.INTERNAL_API_URL ??
        "http://localhost:5000";

    try {
    // ส่งต่อเส้นทาง review หลังตรวจ session แอดมิน โดยไม่เปิดเผย secret ให้ browser
    const { path = [] } = await context.params;
    const url = new URL(
        `/api/admin/tors/${path.map(encodeURIComponent).join("/")}`,
        base
    );

    url.search = req.nextUrl.search;

        const response = await fetch(url, {
            method: req.method,
            headers: {
                "Content-Type": "application/json",
                "x-internal-secret": secret,
                "x-admin-email": email,
            },
            body:
                req.method === "GET"
                ? undefined
                : await req.text(),
            cache: "no-store",
        });

        const body = await response.text();
        if (!response.headers.get("content-type")?.includes("application/json")) {
            return NextResponse.json(
                { success: false, error: response.status === 404
                    ? "ไม่พบ API รายการ TOR กรุณารีสตาร์ต backend เพื่อโหลดเส้นทางใหม่"
                    : `Backend ส่งข้อมูลที่ไม่ใช่ JSON (HTTP ${response.status})` },
                { status: 502 }
            );
        }

        return new NextResponse(body, {
            status: response.status,
            headers: {
                "Content-Type":
                response.headers.get("content-type") ??
                "application/json",
            },
        });
    } catch (error) {
        console.error("Admin proxy error:", error);

        return NextResponse.json(
            { success: false, error: "Backend connection failed" },
            { status: 502 }
        );
    }
}

export const GET = handler;
export const PATCH = handler;
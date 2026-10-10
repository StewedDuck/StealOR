import { NextRequest, NextResponse } from "next/server";
import { auth, isAdminGmail } from "@/lib/auth";

type Context = {
    params: Promise<{ path?: string[] }>;
};

async function handler(
    req: NextRequest,
    context: Context
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

    const { path = [] } = await context.params;

    const base =
        process.env.INTERNAL_API_URL ??
        "http://localhost:5000";

    const url = new URL(
        `/api/admin/users/${path.map(encodeURIComponent).join("/")}`,
        base
    );

    url.search = req.nextUrl.search;

    try {
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
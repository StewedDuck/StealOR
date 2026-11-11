// frontend/app/api/admin/logs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth"; // ดึงฟังก์ชันเช็ค Session ของ NextAuth

export async function GET(request: NextRequest) {
    try {
        // 1. ดึงข้อมูลอีเมลผู้ใช้ปัจจุบันจาก Session ของ NextAuth
        const session = await auth();
        const email = session?.user?.email;

        if (!email) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(request.url);
        const queryString = url.search;

        const backendUrl = process.env.INTERNAL_API_URL || "http://localhost:5000";
        const proxySecret = process.env.TOR_PROXY_SECRET || "";

        // 2. ส่ง Request ไปหา Backend พร้อมแนบ Header ให้ตรงเป๊ะกับที่ adminAuth รอรับ
        const response = await fetch(`${backendUrl}/api/admin/dashboard/logs${queryString}`, {
            headers: {
                "x-internal-secret": proxySecret,
                "x-admin-email": email,
            },
            cache: "no-store",
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error("Proxy logs error:", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}
import { NextResponse } from 'next/server';
import { auth, isAdminGmail } from '@/lib/auth';

export async function GET(request: Request) {
    const session = await auth();
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    if (!isAdminGmail(email)) return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
    const secret = process.env.TOR_PROXY_SECRET;
    if (!secret) return NextResponse.json({ success: false, error: 'Admin API is not configured' }, { status: 500 });
    const params = new URL(request.url).searchParams;
    const path = params.get("section") === "activity" ? "/activity" : params.get("charts") === "true" ? "/charts" : "";
    try {
        const response = await fetch(`${process.env.INTERNAL_API_URL ?? 'http://localhost:5000'}/api/admin/dashboard${path}`, {
            headers: { 'x-internal-secret': secret, 'x-admin-email': email },
            cache: 'no-store', signal: AbortSignal.timeout(15000),
        });
        if (!response.headers.get('content-type')?.includes('application/json')) {
            return NextResponse.json({ success: false, error: response.status === 404
                ? 'ไม่พบ API แดชบอร์ด กรุณารีสตาร์ต backend เพื่อโหลดเส้นทางใหม่'
                : `Backend ส่งข้อมูลที่ไม่ใช่ JSON (HTTP ${response.status})` }, { status: 502 });
        }
        return NextResponse.json(await response.json(), { status: response.status });
    } catch {
        return NextResponse.json({ success: false, error: 'ไม่สามารถเชื่อมต่อข้อมูลแดชบอร์ดได้' }, { status: 502 });
    }
}

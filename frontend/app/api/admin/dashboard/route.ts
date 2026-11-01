import { NextResponse } from 'next/server';
import { auth, isAdminGmail } from '@/lib/auth';

export async function GET() {
    const session = await auth();
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    if (!isAdminGmail(email)) return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
    const secret = process.env.TOR_PROXY_SECRET;
    if (!secret) return NextResponse.json({ success: false, error: 'Admin API is not configured' }, { status: 500 });
    try {
        const response = await fetch(`${process.env.INTERNAL_API_URL ?? 'http://localhost:5000'}/api/admin/dashboard`, {
            headers: { 'x-internal-secret': secret, 'x-admin-email': email },
            cache: 'no-store', signal: AbortSignal.timeout(15000),
        });
        return NextResponse.json(await response.json(), { status: response.status });
    } catch {
        return NextResponse.json({ success: false, error: 'ไม่สามารถเชื่อมต่อข้อมูลแดชบอร์ดได้' }, { status: 502 });
    }
}

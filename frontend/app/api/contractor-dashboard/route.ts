import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
export async function GET() {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    const secret = process.env.TOR_PROXY_SECRET;
    if (!secret) return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    try {
        const response = await fetch(`${process.env.INTERNAL_API_URL || 'http://localhost:5000'}/api/matching/dashboard`, {
            headers: { 'x-profile-email': session.user.email, 'x-profile-proxy-secret': secret },
            cache: 'no-store', signal: AbortSignal.timeout(55000),
        });
        return NextResponse.json(await response.json(), { status: response.status });
    } catch {
        return NextResponse.json({ success: false, error: 'ระบบอ่านข้อมูลแดชบอร์ดไม่สำเร็จ กรุณาลองอีกครั้ง' }, { status: 502 });
    }
}

import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

async function handler(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const secret = process.env.TOR_PROXY_SECRET;
    if (!secret) return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    const { path = [] } = await context.params;
    try {
        const response = await fetch(`${process.env.INTERNAL_API_URL || 'http://localhost:5000'}/api/comments/${path.map(encodeURIComponent).join('/')}`, {
            method: request.method,
            headers: { 'Content-Type': 'application/json', 'x-profile-email': session.user.email, 'x-profile-proxy-secret': secret },
            ...(request.method !== 'GET' ? { body: await request.text() } : {}),
            cache: 'no-store', signal: AbortSignal.timeout(15000),
        });
        return NextResponse.json(await response.json(), { status: response.status });
    } catch { return NextResponse.json({ success: false, error: 'เชื่อมต่อระบบความคิดเห็นไม่สำเร็จ' }, { status: 502 }); }
}
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
